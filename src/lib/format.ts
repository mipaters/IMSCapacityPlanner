export const cad = (v: number, d = 1) => {
  const a = Math.abs(v)
  const s = v < 0 ? '-' : ''
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(d)}B`
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(d)}M`
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}k`
  return `${s}$${a.toFixed(0)}`
}
export const cadFull = (v: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)

export const km = (v: number, d = 1) => {
  const a = Math.abs(v)
  if (a >= 1e9) return `${(v / 1e9).toFixed(d)}B`
  if (a >= 1e6) return `${(v / 1e6).toFixed(d)}M`
  if (a >= 1e3) return `${(v / 1e3).toFixed(d)}k`
  return v.toFixed(a < 10 ? 2 : 0)
}
export const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`
export const bhca = (v: number) => `${km(v)} BHCA`
export const int = (v: number) => new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 }).format(v)
