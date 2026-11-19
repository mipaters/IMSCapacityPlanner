export type FnId = 'PCSCF' | 'SCSCF' | 'HSS' | 'TAS' | 'MRF' | 'MGCF' | 'SBC' | 'DRA' | 'ENUM' | 'PCRF' | 'ECSCF'
export type SiteId = 'TOR' | 'MTL' | 'CGY' | 'YVR'
export type SvcId = 'volte' | 'vonr' | 'wfc' | 'fixed' | 'sip' | 'oc' | 'iot' | 'rcs'

export const FN_IDS: FnId[] = ['PCSCF', 'SCSCF', 'HSS', 'TAS', 'MRF', 'MGCF', 'SBC', 'DRA', 'ENUM', 'PCRF', 'ECSCF']
export const SITE_IDS: SiteId[] = ['TOR', 'MTL', 'CGY', 'YVR']
export const SVC_IDS: SvcId[] = ['volte', 'vonr', 'wfc', 'fixed', 'sip', 'oc', 'iot', 'rcs']

export interface FnMeta {
  id: FnId
  short: string
  name: string
  unit: string
  /** sized with Erlang B (ports/channels) at the GoS target */
  erlang: boolean
  /** licence price per 1,000 capacity units (CAD, pre-calibration) */
  licensePer1k: number
  /** vCPU per 1,000 capacity units */
  vcpuPer1k: number
  vendor: 'Ericsson' | 'Nokia' | 'Mavenir'
  product: string
  /** registrations per second one capacity-unit-fraction can absorb during a storm (see sim) */
  regWeight: number
  /** calls and registrations touch this function */
  inCallPath: boolean
}

export const FN: Record<FnId, FnMeta> = {
  PCSCF: { id: 'PCSCF', short: 'P-CSCF', name: 'Proxy-CSCF', unit: 'registrations', erlang: false, licensePer1k: 55, vcpuPer1k: 0.9, vendor: 'Nokia', product: 'Nokia CSCF', regWeight: 1, inCallPath: true },
  SCSCF: { id: 'SCSCF', short: 'I/S-CSCF', name: 'Interrogating/Serving-CSCF', unit: 'BHCA', erlang: false, licensePer1k: 120, vcpuPer1k: 1.4, vendor: 'Ericsson', product: 'Ericsson CSCF', regWeight: 1, inCallPath: true },
  HSS: { id: 'HSS', short: 'HSS/UDM', name: 'HSS / 5G UDM', unit: 'lookups/s', erlang: false, licensePer1k: 4800, vcpuPer1k: 55, vendor: 'Ericsson', product: 'Ericsson HSS-FE / UDM', regWeight: 1, inCallPath: true },
  TAS: { id: 'TAS', short: 'TAS/MMTel', name: 'Telephony Application Server', unit: 'concurrent sessions', erlang: false, licensePer1k: 6500, vcpuPer1k: 70, vendor: 'Mavenir', product: 'Mavenir TAS', regWeight: 0.3, inCallPath: true },
  MRF: { id: 'MRF', short: 'MRF', name: 'Media Resource Function', unit: 'media ports', erlang: true, licensePer1k: 95000, vcpuPer1k: 400, vendor: 'Nokia', product: 'Nokia MRF', regWeight: 0, inCallPath: false },
  MGCF: { id: 'MGCF', short: 'BGCF/MGCF', name: 'Breakout / Media Gateway Control', unit: 'PSTN ports', erlang: true, licensePer1k: 62000, vcpuPer1k: 260, vendor: 'Ericsson', product: 'Ericsson MGC', regWeight: 0, inCallPath: true },
  SBC: { id: 'SBC', short: 'IBCF/SBC', name: 'Interconnect Border Control / SBC', unit: 'concurrent sessions', erlang: false, licensePer1k: 5200, vcpuPer1k: 48, vendor: 'Mavenir', product: 'Mavenir SBC', regWeight: 0.2, inCallPath: true },
  DRA: { id: 'DRA', short: 'DRA', name: 'Diameter Routing Agent', unit: 'Diameter TPS', erlang: false, licensePer1k: 7000, vcpuPer1k: 60, vendor: 'Nokia', product: 'Nokia DRA', regWeight: 1, inCallPath: true },
  ENUM: { id: 'ENUM', short: 'ENUM/DNS', name: 'ENUM / DNS', unit: 'queries/s', erlang: false, licensePer1k: 3000, vcpuPer1k: 20, vendor: 'Mavenir', product: 'Mavenir ENUM', regWeight: 0, inCallPath: true },
  PCRF: { id: 'PCRF', short: 'PCRF/PCF', name: 'Policy & Charging Rules / 5G PCF', unit: 'concurrent sessions', erlang: false, licensePer1k: 3500, vcpuPer1k: 40, vendor: 'Ericsson', product: 'Ericsson PCRF / PCF', regWeight: 0, inCallPath: true },
  ECSCF: { id: 'ECSCF', short: 'E-CSCF/LRF', name: 'Emergency CSCF / Location Retrieval', unit: 'emergency calls/s', erlang: false, licensePer1k: 180000, vcpuPer1k: 900, vendor: 'Nokia', product: 'Nokia E-CSCF / LRF', regWeight: 0, inCallPath: false },
}

export interface SiteMeta {
  id: SiteId
  name: string
  lat: number
  lng: number
  pair: SiteId
  /** share of national traffic homed to this site in normal operation */
  share: number
}
export const SITES: Record<SiteId, SiteMeta> = {
  TOR: { id: 'TOR', name: 'Toronto', lat: 43.65, lng: -79.38, pair: 'MTL', share: 0.33 },
  MTL: { id: 'MTL', name: 'Montréal', lat: 45.5, lng: -73.57, pair: 'TOR', share: 0.26 },
  CGY: { id: 'CGY', name: 'Calgary', lat: 51.05, lng: -114.07, pair: 'YVR', share: 0.22 },
  YVR: { id: 'YVR', name: 'Vancouver', lat: 49.28, lng: -123.12, pair: 'CGY', share: 0.19 },
}

export interface SvcMeta {
  id: SvcId
  name: string
  unit: string
  color: string
  /** registered endpoints per subscriber (multi-device) */
  regs: number
  bhca: number
  erl: number
  /** fraction of erlangs terminating on PSTN / TDM breakout */
  pstn: number
  /** fraction of erlangs crossing the border controller */
  sbc: number
  /** fraction of erlangs needing media resources (announcements, conferencing, transcoding) */
  media: number
  /** uses dynamic policy (Rx/Gx) */
  policy: boolean
  /** fraction of call attempts that are emergency */
  emergency: number
}

export const SVC: Record<SvcId, SvcMeta> = {
  volte: { id: 'volte', name: 'VoLTE', unit: 'subscribers', color: '#2dd4bf', regs: 1.15, bhca: 1.6, erl: 0.045, pstn: 0.3, sbc: 0.25, media: 0.06, policy: true, emergency: 0.0021 },
  vonr: { id: 'vonr', name: 'VoNR', unit: 'subscribers', color: '#60a5fa', regs: 1.2, bhca: 1.7, erl: 0.046, pstn: 0.3, sbc: 0.25, media: 0.06, policy: true, emergency: 0.0021 },
  wfc: { id: 'wfc', name: 'Wi-Fi calling', unit: 'users', color: '#a78bfa', regs: 1.0, bhca: 1.2, erl: 0.038, pstn: 0.3, sbc: 0.25, media: 0.06, policy: true, emergency: 0.0026 },
  fixed: { id: 'fixed', name: 'Fixed VoIP (PSTN migration)', unit: 'lines', color: '#f59e0b', regs: 1.0, bhca: 2.2, erl: 0.075, pstn: 0.6, sbc: 0.3, media: 0.1, policy: false, emergency: 0.0018 },
  sip: { id: 'sip', name: 'Enterprise SIP trunks', unit: 'channels', color: '#f472b6', regs: 0.02, bhca: 5.6, erl: 0.28, pstn: 0.55, sbc: 1, media: 0.08, policy: false, emergency: 0.0004 },
  oc: { id: 'oc', name: 'Teams Phone Operator Connect', unit: 'users', color: '#38bdf8', regs: 1.4, bhca: 1.9, erl: 0.05, pstn: 0.4, sbc: 1, media: 0.12, policy: false, emergency: 0.0015 },
  iot: { id: 'iot', name: 'IoT / eCall / wearables', unit: 'devices', color: '#34d399', regs: 1.0, bhca: 0.05, erl: 0.002, pstn: 0.1, sbc: 0.1, media: 0.01, policy: true, emergency: 0.02 },
  rcs: { id: 'rcs', name: 'RCS', unit: 'users', color: '#94a3b8', regs: 1.0, bhca: 0, erl: 0, pstn: 0, sbc: 0, media: 0, policy: false, emergency: 0 },
}

/** Per-subscriber busy-hour load a service places on a function, in the function's own unit. */
export function perSub(fn: FnId, s: SvcId): number {
  const p = SVC[s]
  switch (fn) {
    case 'PCSCF': return p.regs
    case 'SCSCF': return p.bhca
    case 'HSS': return (p.regs / 1800) * 3 + (p.bhca / 3600) * 2.5
    case 'TAS': return p.erl
    case 'MRF': return p.erl * p.media
    case 'MGCF': return p.erl * p.pstn
    case 'SBC': return p.erl * p.sbc
    case 'DRA': return (p.bhca * 6) / 3600 + (p.regs * 4) / 1800
    case 'ENUM': return (p.bhca * 1.1) / 3600
    case 'PCRF': return p.policy ? p.erl * 0.9 : 0
    case 'ECSCF': return (p.bhca * p.emergency) / 3600
  }
}

export interface CalendarEvent {
  id: string
  name: string
  /** absolute month idx */
  month: number
  type: 'seasonal' | 'storm' | 'outage' | 'sports' | 'sunset' | 'holiday'
  /** multiplier on busy-hour BHCA in that month */
  uplift: number
  note: string
  /** excluded from baseline when training the forecast */
  excludeFromBaseline: boolean
}

export interface UnitCosts {
  vcpu: number
  hwRefreshPerInstance: number
  cnfMigrationBase: number
  servicesPct: number
  supportPct: number
  powerPerVcpuYr: number
}
export const UNIT_COSTS: UnitCosts = {
  vcpu: 950,
  hwRefreshPerInstance: 165000,
  cnfMigrationBase: 520000,
  servicesPct: 0.12,
  supportPct: 0.18,
  powerPerVcpuYr: 140,
}

export const VENDOR_COLORS: Record<string, string> = { Ericsson: '#60a5fa', Nokia: '#2dd4bf', Mavenir: '#f59e0b' }
