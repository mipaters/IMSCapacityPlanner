import { create } from 'zustand'
import { DEFAULT_DRIVERS, type Drivers } from '../lib/forecast'
import { DEFAULT_POLICY, type Policy } from '../lib/capacity'

interface State {
  carrier: string
  drivers: Drivers
  policy: Policy
  setCarrier: (c: string) => void
  setDrivers: (d: Partial<Drivers>) => void
  setPolicy: (p: Partial<Policy>) => void
  reset: () => void
}

export const useStore = create<State>((set) => ({
  carrier: 'Maple Telecom',
  drivers: DEFAULT_DRIVERS,
  policy: DEFAULT_POLICY,
  setCarrier: (carrier) => set({ carrier }),
  setDrivers: (d) => set((s) => ({ drivers: { ...s.drivers, ...d } })),
  setPolicy: (p) => set((s) => ({ policy: { ...s.policy, ...p } })),
  reset: () => set({ drivers: DEFAULT_DRIVERS, policy: DEFAULT_POLICY }),
}))
