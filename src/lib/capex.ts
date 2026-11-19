import { FN, FN_IDS, SITES, UNIT_COSTS, type FnId } from '../data/catalog'
import { INVENTORY, nodeName } from '../data/inventory'
import { QUARTERS, NOW, LAST } from './util'
import { DEFAULT_POLICY, quarterRows, type NodeInv, type Policy } from './capacity'
import { DEFAULT_DRIVERS, type Drivers } from './forecast'

export type Strategy = 'vnf' | 'cnf' | 'hybrid'
export type Category = 'License' | 'Compute' | 'Hardware refresh' | 'VNF→CNF migration' | 'Services'

export interface PlanOptions {
  strategy: Strategy
  /** annual capex cap (CAD); lines beyond it are deferred to next year if schedule allows */
  budgetCap: number
  /** 0 (conservative) … 1 (aggressive): fewer buy-ahead quarters */
  riskTolerance: number
  policy: Policy
  drivers: Drivers
  /** use manual spreadsheet-era rules: wider buffers */
  manual?: boolean
}

export interface PlanLine {
  id: string
  quarter: number
  year: number
  nodeId: string
  fn: FnId
  category: Category
  cost: number
  units: number
  /** quarter index when capacity is first required */
  neededQ: number | null
  label: string
  rationale: string
  scenario: string
  /** cost that could slip 12 months without breaching thresholds */
  deferrable: number
  deferredFrom?: number
}

export interface Plan {
  options: PlanOptions
  lines: PlanLine[]
  byYear: Record<number, number>
  byYearCategory: Record<number, Record<Category, number>>
  byYearFn: Record<number, Partial<Record<FnId, number>>>
  capex5: number
  capex3: number
  opex5: number
  tco5: number
  npv: number
  risk: number
  riskParts: { label: string; value: number }[]
  timeToCapacityWeeks: number
  deferrable12: number
  migrations: number
  exposureNodeQuarters: number
}

export const DISCOUNT = 0.08
const LEAD = { license: 1, vnfCompute: 2, cnfCompute: 0 }

const SCENARIO_FOR: Record<FnId, string> = {
  PCSCF: 'Registration storm after regional power outage',
  SCSCF: 'Loss of the Toronto core site',
  HSS: 'HSS/UDM database node failure during peak',
  TAS: "New Year's Eve midnight peak",
  MRF: "New Year's Eve midnight peak",
  MGCF: 'Loss of the Toronto core site',
  SBC: "New Year's Eve midnight peak",
  DRA: 'Registration storm after regional power outage',
  ENUM: "New Year's Eve midnight peak",
  PCRF: 'Vendor software bug forcing rollback',
  ECSCF: 'Mass event + 911 surge',
}

const CSCF_TAS: FnId[] = ['PCSCF', 'SCSCF', 'TAS']
const GLOBAL_SCALE_KEY = 'scale'
const cache = new Map<string, number>()

function nodeMigrationQuarter(n: NodeInv, strategy: Strategy, exhaustQ: number | null): number | null {
  if (n.deployment === 'CNF' || strategy === 'vnf') return null
  if (strategy === 'hybrid' && !CSCF_TAS.includes(n.fn)) return null
  const eolQ = n.eolMonth === null ? 19 : QUARTERS.findIndex((q) => n.eolMonth! >= q.start && n.eolMonth! <= q.end)
  const eol = eolQ < 0 ? 19 : eolQ
  const floor = strategy === 'cnf' ? 2 : 5
  const target = exhaustQ === null ? eol - 1 : Math.min(exhaustQ - 2, eol - 1)
  return Math.max(floor, Math.min(target, 18))
}

export function generatePlan(opts: PlanOptions, scale = costScale()): Plan {
  const { policy, drivers } = opts
  const buffer = opts.manual ? 3 : 1
  const look = opts.manual ? 6 : Math.round(6 - 4 * opts.riskTolerance)
  const lines: PlanLine[] = []
  let migrations = 0
  let exposure = 0
  let n1 = 0

  for (const n of INVENTORY) {
    const meta = FN[n.fn]
    const rows = quarterRows(n, drivers, policy)
    const req = rows.map((r) => r.required)
    const firstShort = req.findIndex((r) => r > Math.min(n.installed, n.licensed))
    const migQ = nodeMigrationQuarter(n, opts.strategy, firstShort < 0 ? null : firstShort)
    let capL = n.licensed
    let capI = n.installed
    let migrated = n.deployment === 'CNF'
    const name = nodeName(n)
    const push = (l: Omit<PlanLine, 'id' | 'year' | 'fn' | 'nodeId' | 'scenario'>) =>
      lines.push({ ...l, id: `${n.id}-${lines.length}`, year: QUARTERS[l.quarter].year, fn: n.fn, nodeId: n.id, scenario: SCENARIO_FOR[n.fn] })

    for (let k = 0; k < QUARTERS.length; k++) {
      if (migQ === k && !migrated) {
        migrated = true
        migrations++
        const cost = UNIT_COSTS.cnfMigrationBase * (0.5 + 0.15 * n.instances) * scale
        push({ quarter: k, category: 'VNF→CNF migration', cost, units: 0, neededQ: firstShort < 0 ? null : firstShort, deferrable: 0, label: `Migrate ${name} to cloud-native (CNF)`, rationale: `Removes hardware dependency (EOL ${QUARTERS.find((q) => n.eolMonth !== null && n.eolMonth >= q.start && n.eolMonth <= q.end)?.label ?? 'n/a'}), cuts time-to-capacity from ~6 months to ~2 weeks and avoids VNF refresh.` })
        push({ quarter: k, category: 'Services', cost: cost * UNIT_COSTS.servicesPct, units: 0, neededQ: null, deferrable: 0, label: `Vendor professional services – ${name} migration`, rationale: 'Vendor-led migration, test and cut-over support.' })
        capI = Infinity
      }
      const cnf = migrated
      const lead = Math.max(LEAD.license, cnf ? LEAD.cnfCompute : LEAD.vnfCompute)
      const j = Math.min(QUARTERS.length - 1, k + lead + buffer)
      if (req[j] > Math.min(capL, capI)) {
        const hi = Math.min(QUARTERS.length - 1, j + look)
        const target = Math.max(...req.slice(j, hi + 1))
        const dL = Math.max(0, target - capL)
        const dI = Number.isFinite(capI) ? Math.max(0, target - capI) : 0
        const nearTarget = Math.max(...req.slice(j, Math.min(QUARTERS.length - 1, j + 4 + 1)))
        const needNear = Math.max(0, nearTarget - Math.min(capL, Number.isFinite(capI) ? capI : capL))
        const needTot = Math.max(1, target - Math.min(capL, Number.isFinite(capI) ? capI : capL))
        const defShare = Math.max(0, 1 - needNear / needTot)
        const need = req.findIndex((r, q) => q >= k && r > Math.min(capL, capI))
        const detail = `Peak N-1 utilisation reaches ${(rows[Math.max(need, 0)].utilN1 * 100).toFixed(0)}% by ${QUARTERS[Math.max(need, 0)].label}; policy limit ${(policy.thrN1 * 100).toFixed(0)}%.`
        if (dL > 0) {
          const cost = (dL / 1000) * meta.licensePer1k * (cnf ? 0.92 : 1) * scale
          push({ quarter: k, category: 'License', cost, units: dL, neededQ: need < 0 ? null : need, deferrable: cost * defShare, label: `+${fmtUnits(dL)} ${meta.unit} licences – ${name}`, rationale: detail })
          push({ quarter: k, category: 'Services', cost: cost * UNIT_COSTS.servicesPct, units: 0, neededQ: null, deferrable: cost * UNIT_COSTS.servicesPct * defShare, label: `Vendor services – ${name} licence activation`, rationale: 'Configuration, regression test and activation of added licensed capacity.' })
        }
        if (dI > 0) {
          const cost = (dI / 1000) * meta.vcpuPer1k * UNIT_COSTS.vcpu * scale
          push({ quarter: k, category: 'Compute', cost, units: dI, neededQ: need < 0 ? null : need, deferrable: cost * defShare, label: `+${Math.round((dI / 1000) * meta.vcpuPer1k)} vCPU compute – ${name}`, rationale: `Adds ${cnf ? 'elastic cloud-native' : 'NFVI'} compute behind the licensed capacity. ${detail}` })
        }
        capL = Math.max(capL, target)
        if (Number.isFinite(capI)) capI = Math.max(capI, target)
      }
      if (req[k] > Math.min(capL, capI) * 1.0001 && k > 0) {
        exposure++
        n1++
      }
    }

    // hardware refresh for VNFs not migrated before end-of-life
    if (n.eolMonth !== null && !n.deployment.startsWith('C')) {
      const eolQ = QUARTERS.findIndex((q) => n.eolMonth! >= q.start && n.eolMonth! <= q.end)
      const refreshQ = Math.max(0, eolQ - 2)
      if (eolQ >= 0 && (migQ === null || migQ > refreshQ)) {
        push({ quarter: refreshQ, category: 'Hardware refresh', cost: n.instances * UNIT_COSTS.hwRefreshPerInstance * scale * (opts.manual ? 1.1 : 1), units: 0, neededQ: eolQ, deferrable: 0, label: `Refresh ${n.instances} NFVI hosts – ${name}`, rationale: `NFVI hardware reaches end-of-life in ${QUARTERS[eolQ].label}; vendor support ends.` })
      }
    }
  }

  // budget cap: push deferrable capacity lines into the next year; Q4 2026 is treated as its own (small) period
  const byYear = (ls: PlanLine[]) => ls.reduce<Record<number, number>>((a, l) => ((a[l.year] = (a[l.year] ?? 0) + l.cost), a), {})
  for (let y = 2026; y <= 2030; y++) {
    let tot = byYear(lines)[y] ?? 0
    if (tot <= opts.budgetCap) continue
    const movable = lines.filter((l) => l.year === y && l.deferrable > 0 && (l.category === 'License' || l.category === 'Compute' || l.category === 'Services')).sort((a, b) => b.deferrable / b.cost - a.deferrable / a.cost)
    for (const l of movable) {
      if (tot <= opts.budgetCap) break
      const q = QUARTERS.find((qq) => qq.year === y + 1)!
      l.deferredFrom = l.quarter
      l.quarter = q.k
      l.year = y + 1
      tot -= l.cost
      if (l.neededQ !== null && l.neededQ < l.quarter + 1) exposure++
    }
  }

  const yearly = byYear(lines)
  const byYearCategory: Plan['byYearCategory'] = {}
  const byYearFn: Plan['byYearFn'] = {}
  for (const l of lines) {
    byYearCategory[l.year] ??= { License: 0, Compute: 0, 'Hardware refresh': 0, 'VNF→CNF migration': 0, Services: 0 }
    byYearCategory[l.year][l.category] += l.cost
    byYearFn[l.year] ??= {}
    byYearFn[l.year][l.fn] = (byYearFn[l.year][l.fn] ?? 0) + l.cost
  }
  const capex5 = lines.reduce((a, l) => a + l.cost, 0)
  const capex3 = lines.filter((l) => l.year <= 2029).reduce((a, l) => a + l.cost, 0)

  // run cost of the whole estate (existing + new) over five years
  const opex = runCost(lines, opts, scale)
  const npv = npvOfCosts(lines, opex.perYear)
  const exposurePenalty = exposure * 4
  const execRisk = migrations * 1.4
  const bufferRisk = Math.max(0, (6 - look)) * 3 + (opts.manual ? 0 : 6)
  const risk = Math.min(100, Math.round(8 + exposurePenalty + execRisk + bufferRisk))
  const migratedCritical = opts.strategy !== 'vnf'
  return {
    options: opts,
    lines: lines.sort((a, b) => a.quarter - b.quarter || b.cost - a.cost),
    byYear: yearly,
    byYearCategory,
    byYearFn,
    capex5,
    capex3,
    opex5: opex.total,
    tco5: capex5 + opex.total,
    npv,
    risk,
    riskParts: [
      { label: 'Unmitigated breach exposure', value: Math.round(exposurePenalty) },
      { label: 'Migration execution risk', value: Math.round(execRisk) },
      { label: 'Buffer / look-ahead policy', value: Math.round(bufferRisk) },
      { label: 'Baseline operational risk', value: 8 },
    ],
    timeToCapacityWeeks: migratedCritical ? 2 : 26,
    deferrable12: lines.reduce((a, l) => a + l.deferrable, 0),
    migrations,
    exposureNodeQuarters: n1,
  }
}

function fmtUnits(u: number) {
  if (u >= 1e6) return `${(u / 1e6).toFixed(1)}M`
  if (u >= 1e3) return `${(u / 1e3).toFixed(0)}k`
  return u.toFixed(0)
}

function runCost(lines: PlanLine[], opts: PlanOptions, scale: number) {
  const perYear: Record<number, number> = {}
  const migratedByYear: Record<string, number> = {}
  for (const l of lines) if (l.category === 'VNF→CNF migration') migratedByYear[l.nodeId] = l.year
  let total = 0
  for (let y = 2027; y <= 2031; y++) {
    let c = 0
    for (const n of INVENTORY) {
      const base = (n.licensed / 1000) * FN[n.fn].licensePer1k * scale
      const mig = n.deployment === 'CNF' || (migratedByYear[n.id] !== undefined && migratedByYear[n.id] < y)
      c += base * UNIT_COSTS.supportPct * (mig ? 0.78 : 1)
    }
    for (const l of lines) {
      if (l.year >= y) continue
      const mig = l.nodeId in migratedByYear && migratedByYear[l.nodeId] < y
      if (l.category === 'License') c += l.cost * UNIT_COSTS.supportPct * (mig ? 0.78 : 1)
      if (l.category === 'Compute') c += (l.units / 1000) * FN[l.fn].vcpuPer1k * UNIT_COSTS.powerPerVcpuYr * scale * (mig ? 0.7 : 1)
    }
    perYear[y] = c
    total += c
  }
  return { perYear, total }
}

function npvOfCosts(lines: PlanLine[], opexPerYear: Record<number, number>) {
  let v = 0
  for (const l of lines) v += l.cost / Math.pow(1 + DISCOUNT, Math.max(0, l.year - 2026))
  for (const [y, c] of Object.entries(opexPerYear)) v += c / Math.pow(1 + DISCOUNT, Number(y) - 2026)
  return -v
}

/** Calibrates the global price scale so the recommended (hybrid) plan lands at $14.0M of 2027 capex. */
export function costScale(): number {
  const hit = cache.get(GLOBAL_SCALE_KEY)
  if (hit) return hit
  const p = generatePlan({ strategy: 'hybrid', budgetCap: 1e12, riskTolerance: 0.4, policy: DEFAULT_POLICY, drivers: DEFAULT_DRIVERS }, 1)
  const y27 = p.byYear[2027] ?? 1
  const s = 14_000_000 / y27
  cache.set(GLOBAL_SCALE_KEY, s)
  return s
}

export const DEFAULT_PLAN_OPTIONS = (): PlanOptions => ({ strategy: 'hybrid', budgetCap: 20_000_000, riskTolerance: 0.4, policy: DEFAULT_POLICY, drivers: DEFAULT_DRIVERS })

/** Last year's spreadsheet plan: VNF only, conservative thresholds, wide buffers. */
export function manualPlan(drivers: Drivers = DEFAULT_DRIVERS): Plan {
  return generatePlan({ strategy: 'hybrid', budgetCap: 1e12, riskTolerance: 0, policy: DEFAULT_POLICY, drivers, manual: true })
}

/* ---------- Traceability ---------- */
export const DRIVER_LABELS: Record<string, string> = {
  pstn: 'PSTN migration', vonr: 'VoNR adoption', sunset: '3G sunset', wfc: 'Wi-Fi calling growth', iot: 'IoT / multi-device', sip: 'Enterprise SIP / Operator Connect', organic: 'Organic VoLTE growth & seasonality',
}
const NEUTRAL: Record<string, Partial<Drivers>> = {
  pstn: { pstnPace: 0 },
  vonr: { vonrAdoption: 0 },
  sunset: { sunsetMonth: NOW + 400 },
  wfc: { wfcGrowth: 0 },
  iot: { iotGrowth: 0 },
  sip: { sipGrowth: 0 },
}
import { evalNode } from './capacity'
export function driverShares(n: NodeInv, month: number, d: Drivers, p: Policy) {
  const full = evalNode(n, month, d, p).requiredUnits
  const now = evalNode(n, NOW - 1, d, p).requiredUnits
  const w: Record<string, number> = {}
  for (const [k, v] of Object.entries(NEUTRAL)) w[k] = Math.max(0, full - evalNode(n, month, { ...d, ...v }, p).requiredUnits)
  const all = Object.values(NEUTRAL).reduce((a, v) => ({ ...a, ...v }), {})
  w.organic = Math.max(0, evalNode(n, month, { ...d, ...all }, p).requiredUnits - now)
  const tot = Object.values(w).reduce((a, b) => a + b, 0) || 1
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / tot]))
}

/** Share of capacity-driven spend attributable to each demand driver (cost-weighted over plan lines). */
export function planAttribution(plan: Plan) {
  const acc: Record<string, number> = {}
  let capacityCost = 0
  const { drivers, policy } = plan.options
  for (const l of plan.lines) {
    if (l.category !== 'License' && l.category !== 'Compute' && l.category !== 'Services') continue
    const n = INVENTORY.find((x) => x.id === l.nodeId)!
    const q = QUARTERS[l.neededQ ?? Math.min(l.quarter + 2, QUARTERS.length - 1)]
    const sh = driverShares(n, q.start, drivers, policy)
    capacityCost += l.cost
    for (const [k, v] of Object.entries(sh)) acc[k] = (acc[k] ?? 0) + v * l.cost
  }
  const eol = plan.lines.filter((l) => l.category === 'Hardware refresh' || l.category === 'VNF→CNF migration').reduce((a, l) => a + l.cost, 0)
  return { capacityCost, eol, shares: Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v / (capacityCost || 1)])) as Record<string, number>, dollars: acc }
}

export const LAST_YEAR = 2031
export { LAST }
export const SITE_NAMES = Object.fromEntries(Object.values(SITES).map((s) => [s.id, s.name]))
export { FN_IDS }
