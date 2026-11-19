import { FN, FN_IDS, SITE_IDS, SITES, type FnId, type SiteId } from './catalog'
import { monthFromYM, NOW, LAST } from '../lib/util'
import { DEFAULT_DRIVERS } from '../lib/forecast'
import { DEFAULT_POLICY, nationalLoadSeries, portsForErlangs, type NodeInv } from '../lib/capacity'

/** Months from now at which the N-1 headroom threshold is first breached (calibrates installed/licensed capacity). */
const TARGET: Record<FnId, Record<SiteId, number>> = {
  PCSCF: { TOR: 26, MTL: 28, CGY: 40, YVR: 38 },
  SCSCF: { TOR: 8, MTL: 9, CGY: 30, YVR: 34 },
  HSS: { TOR: 15, MTL: 17, CGY: 44, YVR: 48 },
  TAS: { TOR: 20, MTL: 22, CGY: 33, YVR: 36 },
  MRF: { TOR: 52, MTL: 55, CGY: 62, YVR: 64 },
  MGCF: { TOR: 31, MTL: 33, CGY: 40, YVR: 42 },
  SBC: { TOR: 12, MTL: 19, CGY: 36, YVR: 39 },
  DRA: { TOR: 11, MTL: 14, CGY: 28, YVR: 30 },
  ENUM: { TOR: 60, MTL: 66, CGY: 70, YVR: 72 },
  PCRF: { TOR: 24, MTL: 26, CGY: 38, YVR: 41 },
  ECSCF: { TOR: 38, MTL: 40, CGY: 29, YVR: 31 },
}
/** Licensed-to-needed multipliers where licence pools were bought ahead of demand (stranded). */
const OVERLICENSED: Partial<Record<FnId, Partial<Record<SiteId, number>>>> = {
  HSS: { MTL: 1.45, CGY: 2.2, YVR: 2.5 },
  MRF: { TOR: 1.8, MTL: 1.9, CGY: 2.3, YVR: 2.2 },
  ENUM: { TOR: 1.5, MTL: 1.5, CGY: 1.7, YVR: 1.7 },
  MGCF: { CGY: 1.3, YVR: 1.35 },
}
const BASE_INSTANCES: Record<FnId, number> = { PCSCF: 6, SCSCF: 6, HSS: 4, TAS: 5, MRF: 4, MGCF: 3, SBC: 4, DRA: 3, ENUM: 3, PCRF: 4, ECSCF: 3 }
const CNF: Partial<Record<FnId, SiteId[]>> = { HSS: ['TOR'], TAS: ['YVR'], PCRF: ['TOR', 'MTL'] }
const RELEASE: Record<FnId, string> = { PCSCF: 'R5.4', SCSCF: 'R22.2', HSS: 'R21B', TAS: 'v9.3', MRF: 'R8.1', MGCF: 'R7.0', SBC: 'v8.2', DRA: 'R6.3', ENUM: 'v4.7', PCRF: 'R20.1', ECSCF: 'R5.4' }
const INSTALL_HEADROOM = [1.12, 1.2, 1.3, 1.16, 1.25, 1.1, 1.35, 1.18]

function build(): NodeInv[] {
  const out: NodeInv[] = []
  let k = 0
  for (const fn of FN_IDS) {
    for (const site of SITE_IDS) {
      const d = DEFAULT_DRIVERS
      const p = DEFAULT_POLICY
      const nat = nationalLoadSeries(fn, d, p)
      const share = SITES[site].share
      const pairShare = share + SITES[SITES[site].pair].share
      const t = NOW + TARGET[fn][site]
      let need = 0
      for (let i = NOW; i < Math.min(t, LAST); i++) need = Math.max(need, nat[i] * share / p.thrNormal, (nat[i] * pairShare) / p.thrN1)
      need *= 1.0005
      const instances = BASE_INSTANCES[fn] + (site === 'TOR' ? 1 : 0)
      const usable = FN[fn].erlang ? portsForErlangs(need, p.gos) : need
      const gross = Math.ceil((usable * instances) / (instances - 1))
      const over = OVERLICENSED[fn]?.[site]
      const deployment = CNF[fn]?.includes(site) ? 'CNF' : 'VNF'
      const headroom = INSTALL_HEADROOM[k % INSTALL_HEADROOM.length]
      const installed = over ? gross : Math.ceil(gross * headroom)
      const licensed = over ? Math.ceil(gross * over) : gross
      const gen1 = site === 'TOR' || site === 'MTL'
      out.push({
        id: `${fn}-${site}`,
        fn,
        site,
        vendor: FN[fn].vendor,
        product: FN[fn].product,
        deployment,
        release: RELEASE[fn] + (gen1 ? '' : '.1'),
        instances,
        installed: over ? Math.min(installed, licensed) : installed,
        licensed,
        eolMonth: deployment === 'CNF' ? null : fn === 'MRF' && site === 'TOR' ? monthFromYM(2027, 11) : gen1 ? monthFromYM(2028, 5) : monthFromYM(2029, 11),
        cpuPerInstance: Math.max(16, Math.round(gross / instances / 1000 * FN[fn].vcpuPer1k) || 16),
      })
      k++
    }
  }
  return out
}

export const INVENTORY: NodeInv[] = build()
export const NODE_BY_ID: Record<string, NodeInv> = Object.fromEntries(INVENTORY.map((n) => [n.id, n]))
export const nodeName = (n: NodeInv) => `${FN[n.fn].short} · ${SITES[n.site].name}`
