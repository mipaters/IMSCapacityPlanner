import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { INVENTORY, nodeName } from '../data/inventory'
import { exhaustMonth } from '../lib/capacity'
import { DEFAULT_PLAN_OPTIONS, generatePlan, manualPlan } from '../lib/capex'
import { cad } from '../lib/format'
import { monthLabel, NOW } from '../lib/util'
import { useStore } from '../store/useStore'
import { Kpi } from './Dashboard'
import { AGENTS } from '../data/agents'

export default function Walkthrough() {
  const { drivers, policy, carrier } = useStore()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const ai = useMemo(() => generatePlan({ ...DEFAULT_PLAN_OPTIONS(), drivers, policy }), [drivers, policy])
  const vnf = useMemo(() => generatePlan({ ...DEFAULT_PLAN_OPTIONS(), strategy: 'vnf', drivers, policy }), [drivers, policy])
  const manual = useMemo(() => manualPlan(drivers), [drivers])
  const soon = useMemo(
    () => INVENTORY.map((n) => ({ n, ex: exhaustMonth(n, drivers, policy) })).filter((r) => r.ex !== null && r.ex - NOW <= 12).sort((a, b) => a.ex! - b.ex!),
    [drivers, policy],
  )
  const years = Object.keys(ai.byYear).map((y) => ({ year: y, 'AI plan': ai.byYear[+y] / 1e6, 'All-VNF': (vnf.byYear[+y] ?? 0) / 1e6, 'Manual': (manual.byYear[+y] ?? 0) / 1e6 }))

  const steps = [
    {
      title: 'The planning gap',
      notes: 'Open with the cost of getting this wrong: buying too early strands cash; buying too late risks outages.',
      body: (
        <>
          <p>{carrier} plans IMS core capacity across 4 sites, 11 network functions and 3 vendors using spreadsheets and vendor guidance. Demand is shifting (PSTN sunset, VoNR, Wi-Fi Calling, SIP trunks) faster than the annual cycle.</p>
          <div className="grid grid-cols-3 gap-4">
            <Kpi label="Nodes in scope" value={String(INVENTORY.length)} />
            <Kpi label="Breaching within 12 months" value={String(soon.length)} />
            <Kpi label="Next exhaust" value={soon[0] ? monthLabel(soon[0].ex!) : 'none'} />
          </div>
        </>
      ),
    },
    {
      title: 'Demand, forecast and drivers',
      notes: 'Show forecast page: drivers are explicit so every assumption can be challenged.',
      body: <p>Demand is forecast per service from explicit drivers: PSTN migration pace, VoNR adoption, Wi-Fi Calling and SIP trunk growth, plus calendar events like New Year's Eve and storms. Planners can change any driver and see exhaust dates move.</p>,
      go: ['/forecast', 'Open forecast'],
    },
    {
      title: 'Where capacity runs out',
      notes: 'Dashboard heatmap: N-1 means the node is sized to survive losing one unit or a partner site.',
      body: (
        <ul className="space-y-1">
          {soon.map((r) => (
            <li key={r.n.id} className="flex justify-between border-b border-slate-800 py-1"><span>{nodeName(r.n)}</span><span className="text-amber-300">{monthLabel(r.ex!)}</span></li>
          ))}
        </ul>
      ),
      go: ['/dashboard', 'Open dashboard'],
    },
    {
      title: 'What the agents do',
      notes: 'Agents orchestrate; deterministic models do the math; humans approve spend.',
      body: (
        <ul className="grid gap-2 sm:grid-cols-2">
          {AGENTS.map((a) => <li key={a.id} className="rounded border border-slate-700 p-2"><b>{a.name}</b><div className="text-xs text-slate-400">{a.autonomy} · {a.azure}</div></li>)}
        </ul>
      ),
      go: ['/agents', 'Meet the agents'],
    },
    {
      title: 'The recommended plan',
      notes: 'Compare the AI hybrid plan with all-VNF and the manual spreadsheet approach.',
      body: (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="AI hybrid 5-yr capex" value={cad(ai.capex5)} />
            <Kpi label="All-VNF 5-yr capex" value={cad(vnf.capex5)} />
            <Kpi label="5-yr TCO saving vs VNF" value={cad(vnf.tco5 - ai.tco5)} />
            <Kpi label="Deferrable next 12 mo" value={cad(ai.deferrable12)} />
          </div>
          <div className="card h-64">
            <ResponsiveContainer>
              <AreaChart data={years}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="year" stroke="#94a3b8" />
                <YAxis unit="M" stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} formatter={(v) => `$${Number(v).toFixed(1)}M`} />
                <Legend />
                <Area dataKey="AI plan" stroke="#2dd4bf" fill="#2dd4bf" fillOpacity={0.25} />
                <Area dataKey="All-VNF" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} />
                <Area dataKey="Manual" stroke="#f87171" fill="#f87171" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      ),
      go: ['/capex', 'Open planner'],
    },
    {
      title: 'Stress-tested live',
      notes: 'Run the Calgary + NYE scenario; show approval and audit.',
      body: <p>Before any spend is approved, the Resilience Agent replays failures against the plan: site loss, registration storms, New Year's peak, database failure and release rollbacks. Configuration fixes are tried before hardware.</p>,
      go: ['/scenario', 'Run the live scenario'],
    },
    {
      title: 'Built on Azure, wired to what you have',
      notes: 'Close on integrations: nothing is ripped and replaced; approvals flow into ServiceNow and SAP.',
      body: <p>The platform runs on Azure data, AI Foundry and Entra-governed agents. It reads from your Ericsson, Nokia and Mavenir OSS, BSS and licence portals, and writes approved actions into ServiceNow, SAP and the orchestrator.</p>,
      go: ['/architecture', 'See the architecture'],
    },
  ]
  const s = steps[step]
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Executive Walkthrough</h1>
        <div className="mt-2 h-1.5 rounded bg-slate-800"><div className="h-1.5 rounded bg-teal-400 transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
        <div className="mt-1 text-xs text-slate-400">Step {step + 1} of {steps.length}</div>
      </div>
      <div className="card space-y-4 text-sm">
        <h2 className="text-xl font-medium">{s.title}</h2>
        {s.body}
        {s.go && <button onClick={() => nav(s.go![0])} className="rounded bg-slate-800 px-3 py-1 text-teal-300">{s.go[1]} →</button>}
        <div className="rounded border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400"><b className="text-slate-300">Presenter note:</b> {s.notes}</div>
      </div>
      <div className="flex justify-between">
        <button disabled={step === 0} onClick={() => setStep(step - 1)} className="flex items-center gap-1 rounded bg-slate-800 px-3 py-1 disabled:opacity-30"><ChevronLeft size={14} /> Back</button>
        <button disabled={step === steps.length - 1} onClick={() => setStep(step + 1)} className="flex items-center gap-1 rounded bg-teal-500 px-3 py-1 text-slate-900 disabled:opacity-30">Next <ChevronRight size={14} /></button>
      </div>
    </div>
  )
}
