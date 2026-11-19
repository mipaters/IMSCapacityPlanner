import { FN, SITES, SVC_IDS, perSub, type FnId, type SiteId } from '../data/catalog'
import { LAST, NOW, QUARTERS, monthLabel } from './util'
import { eventUplift, seasonal, subsAt, type Drivers, type SubsMap } from './forecast'

export interface NodeInv {
  id: string
  fn: FnId
  site: SiteId
  vendor: string
  product: string
  deployment: 'VNF' | 'CNF'
  release: string
  instances: number
  /** capacity units (native unit; ports for Erlang functions) */
  installed: number
  licensed: number
  /** hardware end-of-life, month idx (null for cloud-native) */
  eolMonth: number | null
  cpuPerInstance: number
}

export interface Policy {
  thrNormal: number
  thrN1: number
  /** Erlang B grade of service */
  gos: number
  /** peak-day / busy-hour factor over the average busy hour */
  bhFactor: number
  /** emergency surge multiplier for E-CSCF/LRF */
  emergencySurge: number
}
export const DEFAULT_POLICY: Policy = { thrNormal: 0.6, thrN1: 0.8, gos: 0.001, bhFactor: 1.08, emergencySurge: 5 }

/* ---------- Erlang B ---------- */
export function erlangB(A: number, N: number): number {
  let b = 1
  for (let n = 1; n <= N; n++) b = (A * b) / (n + A * b)
  return b
}
/** smallest port count such that blocking <= gos for offered Erlangs A */
export function portsForErlangs(A: number, gos: number): number {
  if (A <= 0) return 0
  let b = 1
  for (let n = 1; n < 5_000_000; n++) {
    b = (A * b) / (n + A * b)
    if (b <= gos && n >= A) return n
  }
  return Math.ceil(A * 2)
}
const capCache = new Map<string, number>()
/** max offered Erlangs N ports can carry at blocking <= gos */
export function erlangCapacity(N: number, gos: number): number {
  if (N <= 0) return 0
  const k = `${Math.round(N)}|${gos}`
  const hit = capCache.get(k)
  if (hit !== undefined) return hit
  let lo = 0
  let hi = N
  for (let it = 0; it < 40; it++) {
    const mid = (lo + hi) / 2
    if (erlangB(mid, Math.round(N)) <= gos) lo = mid
    else hi = mid
  }
  capCache.set(k, lo)
  return lo
}

/* ---------- Load ---------- */
const loadCache = new Map<string, Float64Array>()
const key = (d: Drivers, p: Policy) =>
  `${d.sunsetMonth}|${d.pstnPace}|${d.vonrAdoption}|${d.wfcGrowth}|${d.iotGrowth}|${d.sipGrowth}|${d.majorEvent}|${p.bhFactor}|${p.emergencySurge}`

export function loadBreakdown(fn: FnId, subs: SubsMap, mult: number) {
  return SVC_IDS.map((s) => ({ svc: s, subs: subs[s], perSub: perSub(fn, s), load: subs[s] * perSub(fn, s) * mult })).filter((r) => r.load > 0)
}

/** National busy-hour load per month (idx 0..LAST) for a function, native unit (Erlangs for Erlang functions). */
export function nationalLoadSeries(fn: FnId, d: Drivers, p: Policy): Float64Array {
  const k = `${fn}|${key(d, p)}`
  const hit = loadCache.get(k)
  if (hit) return hit
  const arr = new Float64Array(LAST + 1)
  const surge = fn === 'ECSCF' ? p.emergencySurge : 1
  for (let i = 0; i <= LAST; i++) {
    const subs = subsAt(i, d)
    let l = 0
    for (const s of SVC_IDS) l += subs[s] * perSub(fn, s)
    arr[i] = l * p.bhFactor * seasonal(i) * eventUplift(i, d) * surge
  }
  if (loadCache.size > 80) loadCache.clear()
  loadCache.set(k, arr)
  return arr
}

export const siteLoad = (fn: FnId, site: SiteId, i: number, d: Drivers, p: Policy) =>
  nationalLoadSeries(fn, d, p)[i] * SITES[site].share
export const pairLoad = (fn: FnId, site: SiteId, i: number, d: Drivers, p: Policy) =>
  nationalLoadSeries(fn, d, p)[i] * (SITES[site].share + SITES[SITES[site].pair].share)

/* ---------- Capacity ---------- */
/** binding capacity in native units after N+1 within the site (ports for Erlang functions) */
export function usableUnits(n: NodeInv) {
  return Math.min(n.installed, n.licensed) * ((n.instances - 1) / n.instances)
}
/** capacity expressed in the same unit as load (Erlangs @ GoS for Erlang functions) */
export function loadCapacity(n: NodeInv, p: Policy) {
  const u = usableUnits(n)
  return FN[n.fn].erlang ? erlangCapacity(u, p.gos) : u
}

export interface NodeEval {
  loadSelf: number
  loadPair: number
  cap: number
  utilNormal: number
  utilN1: number
  /** required capacity in native units to meet the headroom policy */
  requiredUnits: number
  breach: boolean
}

export function evalNode(n: NodeInv, i: number, d: Drivers, p: Policy): NodeEval {
  const self = siteLoad(n.fn, n.site, i, d, p)
  const pair = pairLoad(n.fn, n.site, i, d, p)
  const cap = loadCapacity(n, p)
  const utilNormal = self / cap
  const utilN1 = pair / cap
  const reqLoad = Math.max(self / p.thrNormal, pair / p.thrN1)
  const reqUsable = FN[n.fn].erlang ? portsForErlangs(reqLoad, p.gos) : reqLoad
  const requiredUnits = reqUsable * (n.instances / (n.instances - 1))
  return { loadSelf: self, loadPair: pair, cap, utilNormal, utilN1, requiredUnits, breach: utilN1 > p.thrN1 || utilNormal > p.thrNormal }
}

export function exhaustMonth(n: NodeInv, d: Drivers, p: Policy): number | null {
  for (let i = NOW; i <= LAST; i++) {
    const self = siteLoad(n.fn, n.site, i, d, p)
    const pair = pairLoad(n.fn, n.site, i, d, p)
    const cap = loadCapacity(n, p)
    if (pair / cap > p.thrN1 || self / cap > p.thrNormal) return i
  }
  return null
}

export interface QuarterRow {
  label: string
  monthStart: number
  required: number
  installed: number
  licensed: number
  utilN1: number
  utilNormal: number
  breach: boolean
}

export function quarterRows(n: NodeInv, d: Drivers, p: Policy): QuarterRow[] {
  return QUARTERS.map((q) => {
    let best = evalNode(n, q.start, d, p)
    for (let i = q.start + 1; i <= q.end; i++) {
      const e = evalNode(n, i, d, p)
      if (e.utilN1 > best.utilN1) best = e
    }
    return {
      label: q.label,
      monthStart: q.start,
      required: best.requiredUnits,
      installed: n.installed,
      licensed: n.licensed,
      utilN1: best.utilN1,
      utilNormal: best.utilNormal,
      breach: best.breach,
    }
  })
}

/** current (month NOW-1) usage, used for licence reporting */
export function currentUsage(n: NodeInv, d: Drivers, p: Policy) {
  const e = evalNode(n, NOW - 1, d, p)
  return { used: e.loadSelf, cap: e.cap, util: e.utilNormal, utilN1: e.utilN1 }
}

export function ragOfN1(u: number, p: Policy): 'green' | 'amber' | 'red' {
  if (u >= p.thrN1) return 'red'
  if (u >= p.thrN1 * 0.85) return 'amber'
  return 'green'
}

/* ---------- Explain this number ---------- */
export interface Explain {
  title: string
  formula: string
  inputs: { k: string; v: string }[]
  result: string
  note?: string
}

import { km, pct } from './format'
export function explainNode(n: NodeInv, i: number, d: Drivers, p: Policy): Explain {
  const meta = FN[n.fn]
  const subs = subsAt(i, d)
  const mult = p.bhFactor * seasonal(i) * eventUplift(i, d) * (n.fn === 'ECSCF' ? p.emergencySurge : 1)
  const rows = loadBreakdown(n.fn, subs, mult)
  const nat = rows.reduce((a, r) => a + r.load, 0)
  const e = evalNode(n, i, d, p)
  return {
    title: `${meta.short} ${SITES[n.site].name} – utilisation under N-1 (${monthLabel(i)})`,
    formula: `Load = Σ(subs × per-sub profile) × busy-hour × seasonal × event;  Util(N-1) = (site share + partner share) × National load ÷ usable capacity`,
    inputs: [
      ...rows.slice(0, 5).map((r) => ({ k: `${r.svc} subs × ${r.perSub.toPrecision(3)}/sub`, v: `${km(r.subs)} → ${km(r.load / mult)}` })),
      { k: 'Busy-hour × seasonal × event × surge', v: mult.toFixed(3) },
      { k: `National load (${meta.unit})`, v: km(nat) },
      { k: `Site share ${SITES[n.site].name} + partner ${SITES[SITES[n.site].pair].name}`, v: pct(SITES[n.site].share + SITES[SITES[n.site].pair].share, 0) },
      { k: `Usable capacity (N+1 on ${n.instances} instances, min(installed, licensed))`, v: `${km(e.cap)} ${meta.erlang ? 'Erlangs @ GoS ' + pct(p.gos, 2) : meta.unit}` },
      { k: 'Thresholds normal / N-1', v: `${pct(p.thrNormal, 0)} / ${pct(p.thrN1, 0)}` },
    ],
    result: `${pct(e.utilN1)} under N-1 (${pct(e.utilNormal)} normal)`,
    note: meta.erlang ? 'Port pools are sized with Erlang B: capacity in Erlangs is the maximum offered load carried at the target grade of service.' : undefined,
  }
}

/* ---------- Registration storm ---------- */
export interface StormParams {
  devices: number
  windowSec: number
  /** registrations/s the weakest function on the path can process */
  capacity: number
  backoff: 'aggressive' | 'tuned'
  overloadControl: boolean
}
export interface StormStep { t: number; offered: number; goodput: number; backlog: number; registered: number }
export function registrationStorm(p: StormParams) {
  const dt = 10
  const steps: StormStep[] = []
  let backlog = 0
  let registered = 0
  let arrived = 0
  const aggressive = p.backoff === 'aggressive'
  let recovered: number | null = null
  for (let t = 0; t <= 3600; t += dt) {
    const arr = t < p.windowSec ? (p.devices / p.windowSec) * dt : 0
    arrived += arr
    // retransmissions amplify offered load; tuned back-off decays retry rate over time
    const retryRate = aggressive ? 1.9 : 0.55 * Math.exp(-t / 400) + 0.08
    const offered = (arr + backlog * retryRate) / dt
    const collapse = aggressive ? 0.45 : p.overloadControl ? 0.05 : 0.15
    const over = offered / Math.max(p.capacity, 1)
    const goodput = over <= 1 ? offered : p.capacity * Math.max(0.4, 1 - collapse * Math.min(2, over - 1))
    const served = Math.min(goodput * dt, arr + backlog)
    backlog = Math.max(0, backlog + arr - served)
    registered += served
    steps.push({ t, offered, goodput: served / dt, backlog, registered })
    if (recovered === null && arrived >= p.devices * 0.9999 && backlog < p.devices * 0.01) recovered = t
  }
  const at = (sec: number) => steps.find((s) => s.t >= sec) ?? steps[steps.length - 1]
  return { steps, successPct: Math.min(1, at(1800).registered / p.devices), recoverSec: recovered }
}
