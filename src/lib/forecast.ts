import { LAST, NOW, clamp, logistic, mulberry32, gauss, monthFromYM } from './util'
import type { CalendarEvent, SvcId } from '../data/catalog'
import { SVC_IDS, SVC } from '../data/catalog'

export interface Drivers {
  /** absolute month index of the 3G sunset */
  sunsetMonth: number
  /** thousand fixed lines migrated off PSTN per month */
  pstnPace: number
  /** VoNR adoption as % of the base-case curve */
  vonrAdoption: number
  /** Wi-Fi calling growth per year */
  wfcGrowth: number
  /** IoT device growth per year */
  iotGrowth: number
  /** enterprise SIP channel growth per year */
  sipGrowth: number
  majorEvent: boolean
}

export const DEFAULT_DRIVERS: Drivers = {
  sunsetMonth: NOW + 16,
  pstnPace: 30,
  vonrAdoption: 100,
  wfcGrowth: 0.09,
  iotGrowth: 0.22,
  sipGrowth: 0.07,
  majorEvent: false,
}

const SUNSET_MIGRANTS = 1_100_000
const VONR_PEAK = 5_200_000
const VONR_MID = NOW + 30
const FIXED_POOL = 3_000_000

export function serviceSubs(s: SvcId, i: number, d: Drivers): number {
  const y = (i - NOW) / 12
  const fut = i >= NOW
  switch (s) {
    case 'volte': {
      const organic = 7_400_000 * Math.pow(fut ? 1.02 : 1.05, y)
      const sunset = SUNSET_MIGRANTS * clamp((i - (d.sunsetMonth - 5)) / 6, 0, 1)
      return organic + sunset
    }
    case 'vonr': {
      const k = d.vonrAdoption / 100
      return VONR_PEAK * k * logistic((i - VONR_MID) / 14)
    }
    case 'wfc':
      return 1_500_000 * Math.pow(1 + (fut ? d.wfcGrowth : 0.12), y)
    case 'fixed':
      return fut
        ? Math.min(FIXED_POOL, 900_000 + d.pstnPace * 1000 * (i - NOW))
        : Math.max(120_000, 900_000 - 15_000 * (NOW - i))
    case 'sip':
      return 420_000 * Math.pow(1 + (fut ? d.sipGrowth : 0.05), y)
    case 'oc':
      return 180_000 * Math.pow(fut ? 1.15 : 1.25, y)
    case 'iot':
      return 2_200_000 * Math.pow(1 + (fut ? d.iotGrowth : 0.3), y)
    case 'rcs':
      return 5_000_000 * Math.pow(1.06, y)
  }
}

export type SubsMap = Record<SvcId, number>
export function subsAt(i: number, d: Drivers): SubsMap {
  const o = {} as SubsMap
  for (const s of SVC_IDS) o[s] = serviceSubs(s, i, d)
  return o
}

const SEASON = [1.0, 0.99, 1.0, 1.0, 1.03, 1.01, 0.98, 0.98, 1.01, 1.01, 1.02, 1.07]
export const seasonal = (i: number) => SEASON[(2021 * 12 + 10 + i) % 12]

export const CALENDAR: CalendarEvent[] = [
  { id: 'nye', name: "New Year's Eve", month: monthFromYM(2025, 11), type: 'holiday', uplift: 1.12, note: 'Midnight call/text peak; +340% BHCA in 5 minutes at 00:00', excludeFromBaseline: false },
  { id: 'storm-24', name: 'Winter storm – Ontario/Québec', month: monthFromYM(2025, 0), type: 'storm', uplift: 1.18, note: 'Mass power loss; radio outage and registration storm during recovery', excludeFromBaseline: true },
  { id: 'mday', name: "Mother's Day", month: monthFromYM(2026, 4), type: 'holiday', uplift: 1.05, note: 'Annual calling peak on second Sunday of May', excludeFromBaseline: false },
  { id: 'outage-25', name: 'Competitor national outage – traffic spill', month: monthFromYM(2025, 6), type: 'outage', uplift: 1.14, note: 'Subscribers retried calls on our network for ~9 hours', excludeFromBaseline: true },
  { id: 'storm-26', name: 'Ice storm outage recovery', month: monthFromYM(2026, 2), type: 'storm', uplift: 1.22, note: 'Ice storm in Southern Ontario; 2.1M devices re-registered after power restoration', excludeFromBaseline: true },
  { id: 'cup-26', name: 'Stanley Cup final – Game 7', month: monthFromYM(2026, 5), type: 'sports', uplift: 1.08, note: 'Post-game call surge on the east-coast core pair', excludeFromBaseline: true },
  { id: 'sunset-3g-ph1', name: '3G sunset – phase 1 (Atlantic)', month: monthFromYM(2026, 8), type: 'sunset', uplift: 1.0, note: 'First regional 3G switch-off; 0.2M users move to VoLTE', excludeFromBaseline: false },
]
export const MAJOR_EVENT: CalendarEvent = {
  id: 'major', name: 'Major event (storm / sports final)', month: NOW + 7, type: 'storm', uplift: 1.25, note: 'User-injected what-if event', excludeFromBaseline: false,
}

/** Monthly event uplift on busy-hour load (history: calendar; forecast: recurring peaks + optional what-if). */
export function eventUplift(i: number, d: Drivers): number {
  let u = 1
  for (const e of CALENDAR) if (e.month === i && e.type !== 'seasonal') u = Math.max(u, e.uplift)
  if (i >= NOW && d.majorEvent && i === MAJOR_EVENT.month) u = Math.max(u, MAJOR_EVENT.uplift)
  return u
}

export function totalBhcaAt(i: number, d: Drivers) {
  const subs = subsAt(i, d)
  let t = 0
  for (const s of SVC_IDS) t += subs[s] * (s === 'rcs' ? 0 : 1) * perBhca[s]
  return t
}
const perBhca = Object.fromEntries(SVC_IDS.map((s) => [s, SVC[s].bhca])) as Record<SvcId, number>

export interface ForecastPoint {
  i: number
  value: number
  lo: number
  hi: number
  actual?: number
}
const rng = mulberry32(20261118)
const NOISE = Array.from({ length: LAST + 1 }, () => gauss(rng))

/** 5-yr monthly forecast with confidence bands, plus 60 months of noisy history. */
export function forecastSeries(s: SvcId, d: Drivers): ForecastPoint[] {
  const out: ForecastPoint[] = []
  for (let i = 0; i <= LAST; i++) {
    const v = serviceSubs(s, i, d)
    if (i < NOW) {
      const a = v * (1 + 0.004 * NOISE[i])
      out.push({ i, value: v, lo: v, hi: v, actual: a })
    } else {
      const h = i - NOW + 1
      const sd = 0.009 * Math.sqrt(h) * (s === 'vonr' || s === 'fixed' ? 1.5 : 1)
      out.push({ i, value: v, lo: v * (1 - 1.28 * sd), hi: v * (1 + 1.28 * sd) })
    }
  }
  return out
}

/** MAPE of last quarter's forecast: compares forecast made 3 months earlier vs realised (synthetic realised = trend + noise). */
export function lastQuarterMape(): number {
  let tot = 0
  let n = 0
  for (const s of SVC_IDS) {
    if (s === 'rcs') continue
    for (let i = NOW - 3; i < NOW; i++) {
      const forecast = serviceSubs(s, i, DEFAULT_DRIVERS) * (1 + 0.012 * Math.sin(i + s.length))
      const actual = serviceSubs(s, i, DEFAULT_DRIVERS) * (1 + 0.004 * NOISE[i])
      tot += Math.abs(forecast - actual) / actual
      n++
    }
  }
  return tot / n
}

export function decompose(i: number, d: Drivers) {
  const trend = totalBhcaAt(i, d)
  const seas = seasonal(i)
  const ev = eventUplift(i, d)
  return { trend, seasonal: trend * (seas - 1), event: trend * seas * (ev - 1), total: trend * seas * ev }
}
