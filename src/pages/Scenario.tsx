import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'
import { NODE_BY_ID, nodeName } from '../data/inventory'
import { recommend, runSim, SCENARIO_BY_ID, type ScenarioId } from '../lib/sim'
import { cad, pct } from '../lib/format'
import { monthLabel, NOW } from '../lib/util'
import { useStore } from '../store/useStore'
import { Kpi } from './Dashboard'

const IDS: ScenarioId[] = ['calgary-down', 'nye']
const STEPS = ['Situation', 'Detect & simulate', 'Agent recommends', 'Human approval', 'Re-test', 'Outcome']

export default function Scenario() {
  const { drivers, policy } = useStore()
  const [step, setStep] = useState(0)
  const [approved, setApproved] = useState<string[]>([])
  const month = NOW + 13
  const ctx = { month, drivers, policy }
  const base = useMemo(() => runSim(IDS, ctx, new Set()), [drivers, policy])
  const recs = useMemo(() => recommend(base, ctx), [base])
  const opex = recs.filter((r) => !r.capex)
  const after = useMemo(() => runSim(IDS, ctx, new Set(opex.filter((r) => approved.includes(r.id)).map((r) => r.id))), [approved, base])
  const data = base.steps.map((s, i) => ({ t: s.t, before: s.blocked * 100, after: after.steps[i].blocked * 100 }))
  const mitCost = opex.filter((r) => approved.includes(r.id)).reduce((a, r) => a + r.cost, 0)
  const hwAlt = opex.reduce((a, r) => a + (r.hardwareAlt ?? 0), 0)
  const audit = approved.map((id) => `${new Date().toISOString().slice(0, 10)} · Approved by Head of Core Engineering · ${opex.find((r) => r.id === id)!.name}`)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Live Scenario: Calgary core loss on New Year's Eve</h1>
        <p className="text-sm text-slate-400">Planning month {monthLabel(month)}. Every number below is computed live by the simulation and plan models.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} className={`rounded-full px-3 py-1 text-xs ${i === step ? 'bg-teal-500 text-slate-900' : i < step ? 'bg-slate-700' : 'bg-slate-800 text-slate-400'}`}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className="card space-y-2 text-sm">
          <p>{SCENARIO_BY_ID['calgary-down'].desc}</p>
          <p>{SCENARIO_BY_ID['nye'].desc}</p>
          <p className="text-slate-400">The question for the VP of Network Engineering: with the current plan, does the network survive both at once, and what is the cheapest way to make sure it does?</p>
        </div>
      )}

      {step >= 1 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="Calls blocked (avg, no action)" value={pct(base.blockedPct, 1)} />
          <Kpi label="Peak blocked" value={pct(base.peakBlockedPct, 1)} />
          <Kpi label="Nodes over threshold" value={String(base.breaches.length)} />
          <Kpi label="Verdict" value={base.verdict.toUpperCase()} />
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <h2 className="mb-2 font-medium">Worst-hit nodes (Vancouver carries 100% of the western pair load)</h2>
          <ul className="space-y-1 text-sm">
            {base.breaches.slice(0, 6).map((b) => (
              <li key={b.nodeId} className="flex justify-between">
                <span>{nodeName(NODE_BY_ID[b.nodeId])}</span>
                <span className="text-red-300">peak {pct(b.peakUtil, 0)} of capacity</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 2 && (
        <div className="card space-y-3">
          <h2 className="font-medium">Resilience Agent recommendations</h2>
          {opex.map((r) => (
            <div key={r.id} className="rounded border border-slate-700 p-3 text-sm">
              <div className="flex justify-between"><b>{r.name}</b><span>{r.cost === 0 ? 'No cost' : cad(r.cost)}</span></div>
              <p className="text-slate-400">{r.detail}</p>
              {r.hardwareAlt ? <p className="text-xs text-amber-300">Permanent hardware alternative: {cad(r.hardwareAlt)}</p> : null}
            </div>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="card space-y-3">
          <h2 className="font-medium">Approval queue</h2>
          {opex.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded border border-slate-700 p-3 text-sm">
              <span>{r.name} ({r.cost === 0 ? 'no cost' : cad(r.cost)})</span>
              {approved.includes(r.id) ? (
                <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 size={14} /> Approved</span>
              ) : (
                <button onClick={() => setApproved([...approved, r.id])} className="rounded bg-teal-500 px-3 py-1 text-slate-900">Approve</button>
              )}
            </div>
          ))}
          <button onClick={() => setApproved(opex.map((r) => r.id))} className="text-xs text-teal-300">Approve all</button>
          {audit.length > 0 && (
            <div className="text-xs text-slate-400">
              <div className="mb-1 font-medium text-slate-300">Audit trail</div>
              {audit.map((a) => <div key={a}>{a}</div>)}
            </div>
          )}
        </div>
      )}

      {step >= 4 && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Blocked after mitigation" value={pct(after.blockedPct, 2)} />
            <Kpi label="Improvement" value={base.blockedPct > 0 ? `${Math.round((1 - after.blockedPct / base.blockedPct) * 100)}%` : 'n/a'} />
            <Kpi label="Mitigation cost" value={cad(mitCost)} />
            <Kpi label="Hardware alternative" value={cad(hwAlt)} />
          </div>
          {approved.length === 0 && <p className="text-sm text-amber-300">No mitigations approved yet. Go back to step 4 to approve them.</p>}
          <div className="card h-72">
            <ResponsiveContainer>
              <LineChart data={data}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="t" unit="m" stroke="#94a3b8" />
                <YAxis unit="%" stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} formatter={(v) => `${Number(v).toFixed(2)}%`} />
                <Legend />
                <Line dataKey="before" name="Before" stroke="#f87171" dot={false} />
                <Line dataKey="after" name="After approved mitigations" stroke="#2dd4bf" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {step === 5 && (
        <div className="card space-y-2 text-sm">
          <h2 className="font-medium">Outcome</h2>
          <p>Approved mitigations cost {cad(mitCost)} against {cad(hwAlt)} of permanent hardware to achieve a similar buffer, and no capex was pulled forward.</p>
          <p className="text-slate-400">Residual risk: {after.breaches.length} node(s) remain above threshold in this combined event. These feed the Capex Planner as candidates for the next purchase wave.</p>
        </div>
      )}

      <div className="flex justify-between">
        <button disabled={step === 0} onClick={() => setStep(step - 1)} className="flex items-center gap-1 rounded bg-slate-800 px-3 py-1 disabled:opacity-30"><ChevronLeft size={14} /> Back</button>
        <button disabled={step === STEPS.length - 1} onClick={() => setStep(step + 1)} className="flex items-center gap-1 rounded bg-teal-500 px-3 py-1 text-slate-900 disabled:opacity-30">Next <ChevronRight size={14} /></button>
      </div>
    </div>
  )
}
