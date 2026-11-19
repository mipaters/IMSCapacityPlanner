import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { MITIGATIONS, runSim, SCENARIOS, type MitigationId, type ScenarioId } from '../lib/sim'
import { nodeName } from '../data/inventory'
import { NODE_BY_ID } from '../data/inventory'
import { pct } from '../lib/format'
import { NOW } from '../lib/util'
import { useStore } from '../store/useStore'
import { Kpi } from './Dashboard'

export default function Simulator() {
  const { drivers, policy } = useStore()
  const [sel, setSel] = useState<ScenarioId[]>(['loss-tor'])
  const [mit, setMit] = useState<MitigationId[]>([])
  const res = useMemo(() => runSim(sel, { month: NOW + 13, drivers, policy }, new Set(mit)), [sel, mit, drivers, policy])
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  const data = res.steps.map((s) => ({ t: s.t, blocked: s.blocked * 100, backlog: s.backlog }))
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Failure Simulator</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-2">
          <h2 className="font-medium">Scenarios (combine freely)</h2>
          {SCENARIOS.map((s) => (
            <label key={s.id} className="flex gap-2 text-sm">
              <input type="checkbox" checked={sel.includes(s.id)} onChange={() => setSel(toggle(sel, s.id))} />
              <span>
                <b>{s.short}</b> — <span className="text-slate-400">{s.desc}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="card space-y-2">
          <h2 className="font-medium">Mitigations</h2>
          {(Object.keys(MITIGATIONS) as MitigationId[]).map((m) => (
            <label key={m} className="flex gap-2 text-sm">
              <input type="checkbox" checked={mit.includes(m)} onChange={() => setMit(toggle(mit, m))} />
              <span>
                <b>{MITIGATIONS[m].name}</b> — <span className="text-slate-400">{MITIGATIONS[m].detail}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Verdict" value={res.verdict.toUpperCase()} />
        <Kpi label="Calls blocked (avg)" value={pct(res.blockedPct, 2)} />
        <Kpi label="Registration success" value={res.regSuccessPct === null ? 'n/a' : pct(res.regSuccessPct, 1)} />
        <Kpi label="Recovery" value={res.recoverMin === null ? '> 40 min' : `${res.recoverMin} min`} />
      </div>
      <div className="card h-72">
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid stroke="#1e293b" />
            <XAxis dataKey="t" unit="m" stroke="#94a3b8" />
            <YAxis unit="%" stroke="#94a3b8" />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
            <Line dataKey="blocked" name="Calls blocked %" stroke="#f87171" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="card">
        <h2 className="mb-2 font-medium">Threshold breaches</h2>
        {res.breaches.length === 0 ? (
          <p className="text-sm text-slate-400">None.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {res.breaches.slice(0, 8).map((b) => (
              <li key={b.nodeId} className="flex justify-between">
                <span>{nodeName(NODE_BY_ID[b.nodeId])}</span>
                <span className={b.overload ? 'text-red-300' : 'text-amber-300'}>peak {pct(b.peakUtil, 0)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
