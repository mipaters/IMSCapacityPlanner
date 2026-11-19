import { describe, it, expect } from 'vitest'
import { erlangB, portsForErlangs, erlangCapacity, evalNode, exhaustMonth, DEFAULT_POLICY, registrationStorm } from './capacity'
import { DEFAULT_DRIVERS } from './forecast'
import { INVENTORY, NODE_BY_ID } from '../data/inventory'
import { quarterLabel } from './util'

const P = DEFAULT_POLICY
const D = DEFAULT_DRIVERS

describe('Erlang B', () => {
  it('matches known reference values', () => {
    expect(erlangB(10, 15)).toBeCloseTo(0.0365, 3)
    expect(erlangB(5, 10)).toBeCloseTo(0.0184, 3)
  })
  it('sizes ports for a grade of service', () => {
    const n = portsForErlangs(100, 0.001)
    expect(erlangB(100, n)).toBeLessThanOrEqual(0.001)
    expect(erlangB(100, n - 1)).toBeGreaterThan(0.001)
  })
  it('capacity is the inverse of port sizing', () => {
    const n = portsForErlangs(250, 0.001)
    const cap = erlangCapacity(n, 0.001)
    expect(cap).toBeGreaterThanOrEqual(249)
    expect(cap).toBeLessThan(260)
  })
})

describe('dimensioning', () => {
  it('flags the Toronto S-CSCF N-1 breach in Q3 2027', () => {
    const m = exhaustMonth(NODE_BY_ID['SCSCF-TOR'], D, P)
    expect(m).not.toBeNull()
    expect(quarterLabel(m!)).toBe('Q3 2027')
  })
  it('active-active pair carries 100% of load when partner fails', () => {
    const n = NODE_BY_ID['TAS-TOR']
    const e = evalNode(n, 62, D, P)
    expect(e.loadPair).toBeCloseTo(e.loadSelf * (0.59 / 0.33), 6)
    expect(e.utilN1).toBeGreaterThan(e.utilNormal)
  })
  it('tighter headroom policy exhausts earlier', () => {
    const n = NODE_BY_ID['PCSCF-TOR']
    const a = exhaustMonth(n, D, P)!
    const b = exhaustMonth(n, D, { ...P, thrN1: 0.7 })!
    expect(b).toBeLessThanOrEqual(a)
  })
  it('all nodes are healthy today', () => {
    for (const n of INVENTORY) expect(evalNode(n, 59, D, P).breach).toBe(false)
  })
})

describe('registration storm', () => {
  it('tuned back-off recovers faster than aggressive retries', () => {
    const base = { devices: 2_000_000, windowSec: 600, capacity: 1500, overloadControl: false }
    const a = registrationStorm({ ...base, backoff: 'aggressive' })
    const t = registrationStorm({ ...base, backoff: 'tuned', overloadControl: true })
    expect(t.successPct).toBeGreaterThan(a.successPct)
  })
})
