// Deterministic helpers shared by data generators and models.
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function gauss(rng: () => number) {
  const u = Math.max(rng(), 1e-9)
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
export const logistic = (x: number) => 1 / (1 + Math.exp(-x))

// Month index 0 = Nov 2021, NOW = Nov 2026 (first forecast month), horizon 60 months => idx 119 = Oct 2031.
export const NOW = 60
export const LAST = 119
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function monthYM(i: number) {
  const total = 2021 * 12 + 10 + i
  return { y: Math.floor(total / 12), m: total % 12 }
}
export const monthLabel = (i: number) => {
  const { y, m } = monthYM(i)
  return `${MONTHS[m]} ${y}`
}
export const monthShort = (i: number) => {
  const { y, m } = monthYM(i)
  return `${MONTHS[m]} '${String(y).slice(2)}`
}
export const quarterOf = (i: number) => {
  const { y, m } = monthYM(i)
  return { y, q: Math.floor(m / 3) + 1 }
}
export const quarterLabel = (i: number) => {
  const { y, q } = quarterOf(i)
  return `Q${q} ${y}`
}
export const monthFromYM = (y: number, m0: number) => y * 12 + m0 - (2021 * 12 + 10)

/** Planning quarters: Q4 2026 (Nov–Dec, "now") then calendar quarters to Oct 2031. */
export interface Quarter { k: number; label: string; start: number; end: number; year: number }
export const QUARTERS: Quarter[] = (() => {
  const out: Quarter[] = [{ k: 0, label: quarterLabel(NOW), start: NOW, end: NOW + 1, year: quarterOf(NOW).y }]
  for (let s = NOW + 2, k = 1; s <= LAST; s += 3, k++) out.push({ k, label: quarterLabel(s), start: s, end: Math.min(s + 2, LAST), year: quarterOf(s).y })
  return out
})()
