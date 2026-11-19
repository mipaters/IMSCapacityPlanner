import { FN, SITES, SITE_IDS, UNIT_COSTS, type FnId, type SiteId } from '../data/catalog'
import { INVENTORY } from '../data/inventory'
import { loadCapacity, nationalLoadSeries, type Policy } from './capacity'
import type { Drivers } from './forecast'
import { costScale } from './capex'
import { SVC_IDS } from '../data/catalog'
import { subsAt } from './forecast'
import { SVC } from '../data/catalog'

export type ScenarioId = 'loss-tor' | 'reg-storm' | 'nye' | 'hss-fail' | 'emergency' | 'rollback' | 'calgary-down'
export type MitigationId = 'backoff' | 'overload' | 'prioritise' | 'burst'

export interface ScenarioDef {
  id: ScenarioId
  name: string
  short: string
  desc: string
  siteDown?: SiteId[]
  /** busy-hour multiplier on call load at peak */
  callMult?: number
  stormDevices?: number
  stormWindowMin?: number
  stormSites?: SiteId[]
  capLoss?: { fn: FnId; site: SiteId | 'ALL'; factor: number }[]
  emergencyMult?: number
}

export const SCENARIOS: ScenarioDef[] = [
  { id: 'loss-tor', name: 'Loss of the Toronto core site', short: 'Toronto site loss', desc: 'Toronto IMS core is lost; Montréal carries 100% of the pair load and 30% of Toronto devices re-register.', siteDown: ['TOR'] },
  { id: 'reg-storm', name: 'Registration storm after regional power outage', short: 'Reg. storm (2M devices)', desc: '2M devices re-register within 10 minutes after Ontario/Québec power is restored.', stormDevices: 2_000_000, stormWindowMin: 10, stormSites: ['TOR', 'MTL'] },
  { id: 'nye', name: "New Year's Eve midnight peak", short: 'NYE midnight peak', desc: '+340% BHCA in 5 minutes against the midnight baseline (≈1.45× the planning busy hour).', callMult: 1.45 },
  { id: 'hss-fail', name: 'HSS/UDM database node failure during peak', short: 'HSS/UDM DB failure', desc: 'A database shard at Toronto HSS/UDM fails in the busy hour; 45% of Toronto lookup capacity is lost.', capLoss: [{ fn: 'HSS', site: 'TOR', factor: 0.55 }] },
  { id: 'emergency', name: 'Mass event + 911 surge', short: '911 surge', desc: 'Mass-casualty event: 12× emergency calls at E-CSCF/LRF plus 1.5× general call load.', callMult: 1.5, emergencyMult: 12 },
  { id: 'rollback', name: 'Vendor software bug forcing a rollback', short: 'Release rollback', desc: 'Emergency rollback of S-CSCF and TAS to the previous release (−22% throughput per instance) at all sites.', capLoss: [{ fn: 'SCSCF', site: 'ALL', factor: 0.78 }, { fn: 'TAS', site: 'ALL', factor: 0.78 }] },
  { id: 'calgary-down', name: 'Loss of the Calgary core site', short: 'Calgary site loss', desc: 'Calgary IMS core is lost; Vancouver carries 100% of the western pair load.', siteDown: ['CGY'] },
]
export const SCENARIO_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s])) as Record<ScenarioId, ScenarioDef>

export const MITIGATIONS: Record<MitigationId, { name: string; detail: string; cost: number }> = {
  backoff: { name: 'Back-off timer & retry tuning', detail: 'Exponential back-off with jitter (30–300 s) on UE and P-CSCF re-registration; configuration only.', cost: 0 },
  overload: { name: 'Overload control tuning', detail: 'Retune S-CSCF/TAS/HSS load-shedding thresholds (85% / 95%) so overload degrades gracefully instead of collapsing.', cost: 90_000 },
  prioritise: { name: 'Traffic prioritisation', detail: 'Protect emergency, GETS and enterprise-trunk traffic; throttle low-priority registrations first.', cost: 60_000 },
  burst: { name: 'Cloud-native capacity burst', detail: 'Temporary burst on cloud-native TAS/SBC pools for the event window (pay-per-use).', cost: 0 },
}

const CALL_FN_WEIGHT: Partial<Record<FnId, number>> = { PCSCF: 1, SCSCF: 1, TAS: 1, HSS: 1, DRA: 1, ENUM: 1, PCRF: 0.85, SBC: 0.3, MGCF: 0.4 }
const REG_UNIT: Partial<Record<FnId, number>> = { PCSCF: 5, SCSCF: 360, HSS: 0.6, DRA: 0.8 }
const CALL_SENSITIVE: FnId[] = ['SCSCF', 'TAS', 'MRF', 'MGCF', 'SBC', 'ENUM', 'PCRF']
const FAILOVER_REREG = 0.3
const STEP = 0.5
const DURATION = 40

export interface SimCtx { month: number; drivers: Drivers; policy: Policy }
export interface SimStep { t: number; blocked: number; regOffered: number; regGood: number; backlog: number; registered: number; emergencyBlocked: number }
export interface SimNodeFrame { util: number }
export interface Breach { nodeId: string; fn: FnId; site: SiteId; peakUtil: number; limit: number; overload: boolean }
export interface SimResult {
  steps: SimStep[]
  /** nodeId -> util per step */
  nodeUtil: Record<string, number[]>
  siteDown: SiteId[]
  blockedPct: number
  peakBlockedPct: number
  regSuccessPct: number | null
  stormDevices: number
  recoverMin: number | null
  breaches: Breach[]
  emergencyOk: boolean
  emergencyBlockedPct: number
  verdict: 'pass' | 'degraded' | 'fail'
  shortfallByFn: Partial<Record<FnId, number>>
}

function shape(t: number, hold: number, decay: number) {
  if (t < 0) return 0
  if (t < 2) return t / 2
  if (t < 2 + hold) return 1
  return Math.exp(-(t - 2 - hold) / decay)
}

export function runSim(ids: ScenarioId[], ctx: SimCtx, mit: Set<MitigationId>): SimResult {
  const defs = ids.map((i) => SCENARIO_BY_ID[i])
  const down = new Set<SiteId>(defs.flatMap((d) => d.siteDown ?? []))
  const callMult = defs.reduce((a, d) => a * (d.callMult ?? 1), 1)
  const emMult = defs.reduce((a, d) => a * (d.emergencyMult ?? 1), 1)
  const isPeakEvent = callMult > 1
  const { month, drivers, policy } = ctx
  const subs = subsAt(month, drivers)
  const regTotal = SVC_IDS.reduce((a, s) => a + subs[s] * SVC[s].regs, 0)

  // registration storm devices
  let devices = 0
  const stormSites = new Set<SiteId>()
  let windowMin = 10
  for (const d of defs) {
    if (d.stormDevices) {
      devices += d.stormDevices
      windowMin = Math.max(windowMin, d.stormWindowMin ?? 10)
      d.stormSites?.forEach((s) => stormSites.add(s))
    }
  }
  for (const s of down) {
    devices += regTotal * SITES[s].share * FAILOVER_REREG
    windowMin = Math.max(windowMin, 8)
  }
  const alive = SITE_IDS.filter((s) => !down.has(s))
  const recv = new Set<SiteId>()
  for (const s of stormSites) recv.add(down.has(s) ? SITES[s].pair : s)
  for (const s of down) recv.add(SITES[s].pair)
  const recvAlive = [...recv].filter((s) => !down.has(s))

  const burstFns = new Set<FnId>(mit.has('burst') ? ['TAS', 'SBC'] : [])
  const nodes = INVENTORY.filter((n) => alive.includes(n.site))
  const capOf = (n: (typeof INVENTORY)[number]) => {
    let c = loadCapacity(n, policy)
    for (const d of defs) for (const l of d.capLoss ?? []) if (l.fn === n.fn && (l.site === 'ALL' || l.site === n.site)) c *= l.factor
    if (burstFns.has(n.fn)) c *= 1.45
    return c
  }
  const shareEff = (s: SiteId) => SITES[s].share + (down.has(SITES[s].pair) ? SITES[SITES[s].pair].share : 0)
  const nat: Partial<Record<FnId, number>> = {}
  for (const fn of Object.keys(FN) as FnId[]) nat[fn] = nationalLoadSeries(fn, drivers, policy)[month]

  const peakHold = defs.some((d) => d.id === 'nye') ? 5 : 15
  const mult = (fn: FnId, t: number) => {
    const sh = isPeakEvent ? shape(t, peakHold, 12) : 0
    let m = 1
    if (CALL_SENSITIVE.includes(fn)) m = 1 + (callMult - 1) * sh
    if (fn === 'HSS' || fn === 'DRA') m = 1 + (callMult - 1) * sh * 0.4
    if (fn === 'ECSCF') m = (1 + (callMult - 1) * sh) * (1 + (emMult - 1) * (emMult > 1 ? shape(t, 20, 25) : 0))
    return m
  }
  const callLoad = (n: (typeof INVENTORY)[number], t: number) => nat[n.fn]! * shareEff(n.site) * mult(n.fn, t)

  // registration capacity over time
  const regCap = (t: number) => {
    let total = 0
    for (const s of recvAlive) {
      let site = Infinity
      for (const f of Object.keys(REG_UNIT) as FnId[]) {
        const n = nodes.find((x) => x.fn === f && x.site === s)!
        const ceiling = 0.97
        const spare = Math.max(0, ceiling * capOf(n) - callLoad(n, t))
        site = Math.min(site, spare / REG_UNIT[f]!)
      }
      total += site
    }
    return total
  }

  const steps: SimStep[] = []
  const nodeUtil: Record<string, number[]> = Object.fromEntries(nodes.map((n) => [n.id, [] as number[]]))
  let backlog = 0
  let registered = 0
  let arrived = 0
  const tuned = mit.has('backoff')
  const hasStorm = devices > 0
  let weightedBlocked = 0
  let weightSum = 0
  let peakBlocked = 0
  let emBlockedMax = 0
  const peakUtil: Record<string, number> = {}
  let recover: number | null = null
  const stepCount = Math.round(DURATION / STEP)
  for (let k = 0; k <= stepCount; k++) {
    const t = k * STEP
    const dt = STEP * 60
    const arr = hasStorm && t < windowMin ? (devices / (windowMin * 60)) * dt : 0
    arrived += arr
    const retryRate = tuned ? 0.45 * Math.exp(-t / 6) + 0.07 : 1.8
    const offeredRate = (arr + backlog * retryRate) / dt
    const cap = hasStorm ? regCap(t) : 0
    const over = cap > 0 ? offeredRate / cap : offeredRate > 0 ? 9 : 0
    const collapse = tuned || mit.has('overload') ? 0.06 : 0.45
    const goodRate = over <= 1 ? offeredRate : cap * Math.max(0.35, 1 - collapse * Math.min(2, over - 1))
    const served = Math.min(goodRate * dt, arr + backlog)
    backlog = Math.max(0, backlog + arr - served)
    registered += served

    // call blocking
    let pass = 0
    let w = 0
    for (const s of alive) {
      const share = shareEff(s)
      let p = 1
      for (const n of nodes.filter((x) => x.site === s)) {
        const regShare = recvAlive.includes(s) && hasStorm ? offeredRate / recvAlive.length : 0
        const regLoad = (REG_UNIT[n.fn] ?? 0) * regShare
        const util = (callLoad(n, t) + regLoad) / capOf(n)
        nodeUtil[n.id].push(util)
        peakUtil[n.id] = Math.max(peakUtil[n.id] ?? 0, util)
        const wt = CALL_FN_WEIGHT[n.fn]
        if (wt && util > 1) {
          const degraded = mit.has('overload') ? 0.97 : Math.max(0.55, 1 - 0.5 * (util - 1))
          p *= Math.pow(Math.min(1, (1 / util) * degraded), wt)
        }
      }
      pass += p * share
      w += share
    }
    const blocked = 1 - pass / w
    let emBlocked = 0
    for (const n of nodes.filter((x) => x.fn === 'ECSCF')) {
      const util = nodeUtil[n.id][k]
      if (util > 1) emBlocked = Math.max(emBlocked, 1 - 1 / util)
    }
    if (mit.has('prioritise')) emBlocked *= 0.02
    emBlockedMax = Math.max(emBlockedMax, emBlocked)
    peakBlocked = Math.max(peakBlocked, blocked)
    const weight = Math.max(0.1, mult('SCSCF', t))
    weightedBlocked += blocked * weight
    weightSum += weight
    steps.push({ t, blocked, regOffered: offeredRate, regGood: served / dt, backlog, registered, emergencyBlocked: emBlocked })
  }
  // recovery: last step where anything is still degraded
  const degradedAt = (s: SimStep) => s.blocked > 0.001 || s.backlog > devices * 0.01 || s.emergencyBlocked > 0
  let lastBad = -1
  steps.forEach((s, i) => { if (degradedAt(s)) lastBad = i })
  recover = lastBad < 0 ? 0 : lastBad === steps.length - 1 ? null : steps[lastBad + 1].t

  const breaches: Breach[] = nodes
    .map((n) => {
      const limit = down.size > 0 || isPeakEvent || n.fn === 'HSS' ? policy.thrN1 : policy.thrNormal
      const nodeRef = peakUtil[n.id] ?? 0
      return { nodeId: n.id, fn: n.fn, site: n.site, peakUtil: nodeRef, limit, overload: nodeRef > 1 }
    })
    .filter((b) => b.peakUtil > b.limit)
    .sort((a, b) => b.peakUtil - a.peakUtil)

  const shortfallByFn: Partial<Record<FnId, number>> = {}
  for (const n of nodes) {
    const u = peakUtil[n.id] ?? 0
    if (u > policy.thrN1) shortfallByFn[n.fn] = Math.max(shortfallByFn[n.fn] ?? 0, (u * capOf(n)) / policy.thrN1 - capOf(n))
  }

  const blockedPct = weightedBlocked / weightSum
  const regSuccess = hasStorm ? Math.min(1, steps[Math.round(30 / STEP)].registered / devices) : null
  const emergencyOk = emBlockedMax < 0.001
  const verdict: SimResult['verdict'] = blockedPct > 0.01 || (regSuccess !== null && regSuccess < 0.9) || !emergencyOk ? 'fail' : breaches.length > 0 || (regSuccess !== null && regSuccess < 0.99) ? 'degraded' : 'pass'
  return { steps, nodeUtil, siteDown: [...down], blockedPct, peakBlockedPct: peakBlocked, regSuccessPct: regSuccess, stormDevices: devices, recoverMin: recover, breaches, emergencyOk, emergencyBlockedPct: emBlockedMax, verdict, shortfallByFn }
}

export interface Recommendation { id: MitigationId; name: string; detail: string; cost: number; hardwareAlt?: number; capex: boolean }

/** Resilience Agent: derive mitigations from a baseline run and size each (with a hardware alternative for comparison). */
export function recommend(base: SimResult, ctx: SimCtx): Recommendation[] {
  const out: Recommendation[] = []
  const add = (id: MitigationId, cost?: number, extra?: Partial<Recommendation>) => out.push({ id, name: MITIGATIONS[id].name, detail: MITIGATIONS[id].detail, cost: cost ?? MITIGATIONS[id].cost, capex: false, ...extra })
  if (base.stormDevices > 0 && (base.regSuccessPct ?? 1) < 0.99) add('backoff')
  if (base.breaches.some((b) => b.overload) || base.blockedPct > 0.001) add('overload')
  if (!base.emergencyOk || base.breaches.length > 0) add('prioritise')
  const burstable = (['TAS', 'SBC'] as FnId[]).filter((f) => base.shortfallByFn[f])
  if (burstable.length) {
    const scale = costScale()
    let hw = 0
    let burst = 0
    for (const f of burstable) {
      const units = base.shortfallByFn[f]! * SITE_IDS.length
      hw += (units / 1000) * (FN[f].licensePer1k + FN[f].vcpuPer1k * UNIT_COSTS.vcpu) * scale * 4
      burst += (units / 1000) * FN[f].licensePer1k * scale * 0.05
    }
    add('burst', Math.round(burst), { hardwareAlt: Math.round(hw) })
  } else if (Object.keys(base.shortfallByFn).length) {
    const scale = costScale()
    let hw = 0
    for (const [f, u] of Object.entries(base.shortfallByFn)) hw += ((u! * 2) / 1000) * (FN[f as FnId].licensePer1k + FN[f as FnId].vcpuPer1k * UNIT_COSTS.vcpu) * scale
    out.push({ id: 'burst', name: 'Permanent capacity add (hardware / licences)', detail: 'Residual shortfall on VNF functions that cannot burst; included in the capex plan.', cost: Math.round(hw), capex: true })
  }
  void ctx
  return out
}
