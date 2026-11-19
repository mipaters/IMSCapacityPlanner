import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { SVC, SVC_IDS, type SvcId } from '../data/catalog'
import { forecastSeries, lastQuarterMape } from '../lib/forecast'
import { km, pct } from '../lib/format'
import { monthShort, NOW } from '../lib/util'
import { useStore } from '../store/useStore'

export default function Forecast() {
  const { drivers, setDrivers } = useStore()
  const [svc, setSvc] = useState<SvcId>('volte')
  const data = useMemo(
    () => forecastSeries(svc, drivers).map((p) => ({ label: monthShort(p.i), actual: p.actual, value: p.value, band: [p.lo, p.hi], hist: p.i <= NOW })),
    [svc, drivers],
  )
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Demand Forecast</h1>
      <div className="flex flex-wrap gap-2">
        {SVC_IDS.map((s) => (
          <button key={s} onClick={() => setSvc(s)} className={`rounded-full px-3 py-1 text-sm ${s === svc ? 'bg-teal-500 text-slate-900' : 'bg-slate-800'}`}>
            {SVC[s].name}
          </button>
        ))}
      </div>
      <div className="card h-80">
        <ResponsiveContainer>
          <ComposedChart data={data}>
            <CartesianGrid stroke="#1e293b" />
            <XAxis dataKey="label" interval={11} stroke="#94a3b8" fontSize={11} />
            <YAxis tickFormatter={(v) => km(v)} stroke="#94a3b8" fontSize={11} />
            <Tooltip formatter={(v) => (Array.isArray(v) ? `${km(Number(v[0]))} – ${km(Number(v[1]))}` : km(Number(v)))} contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
            <Area dataKey="band" stroke="none" fill="#2dd4bf" fillOpacity={0.2} name="80% band" />
            <Line dataKey="value" stroke="#2dd4bf" dot={false} name="Forecast" />
            <Line dataKey="actual" stroke="#e2e8f0" dot={false} name="Actual" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-sm text-slate-400">Last-quarter forecast MAPE: {pct(lastQuarterMape(), 1)}</p>
      <div className="card space-y-3">
        <h2 className="font-medium">Drivers</h2>
        <Slider label="PSTN pace" value={drivers.pstnPace} min={0.5} max={1.5} step={0.05} onChange={(v) => setDrivers({ pstnPace: v })} />
        <Slider label="VoNR adoption" value={drivers.vonrAdoption} min={0.5} max={1.5} step={0.05} onChange={(v) => setDrivers({ vonrAdoption: v })} />
        <Slider label="WFC growth" value={drivers.wfcGrowth} min={0.5} max={1.5} step={0.05} onChange={(v) => setDrivers({ wfcGrowth: v })} />
        <Slider label="SIP trunk growth" value={drivers.sipGrowth} min={0.5} max={1.5} step={0.05} onChange={(v) => setDrivers({ sipGrowth: v })} />
        <Slider label="IoT growth" value={drivers.iotGrowth} min={0.5} max={1.5} step={0.05} onChange={(v) => setDrivers({ iotGrowth: v })} />
      </div>
    </div>
  )
}

export function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-36 text-slate-300">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-teal-400" />
      <span className="w-12 text-right tabular-nums">{value.toFixed(2)}</span>
    </label>
  )
}
