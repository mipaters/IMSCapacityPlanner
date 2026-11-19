import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DEFAULT_PLAN_OPTIONS, generatePlan, type Category, type Strategy } from '../lib/capex'
import { cad } from '../lib/format'
import { useStore } from '../store/useStore'
import { Slider } from './Forecast'
import { Kpi } from './Dashboard'

const CATS: Category[] = ['License', 'Compute', 'Hardware refresh', 'VNF→CNF migration', 'Services']
const COLORS = ['#2dd4bf', '#60a5fa', '#f59e0b', '#a78bfa', '#94a3b8']

export default function Capex() {
  const { drivers, policy } = useStore()
  const [strategy, setStrategy] = useState<Strategy>('hybrid')
  const [budgetCap, setCap] = useState(20)
  const [riskTolerance, setRisk] = useState(0.4)
  const plan = useMemo(() => generatePlan({ ...DEFAULT_PLAN_OPTIONS(), strategy, budgetCap: budgetCap * 1e6, riskTolerance, drivers, policy }), [strategy, budgetCap, riskTolerance, drivers, policy])
  const data = Object.entries(plan.byYearCategory).map(([y, c]) => ({ year: y, ...c }))
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Capex Planner</h1>
      <div className="flex gap-2">
        {(['vnf', 'cnf', 'hybrid'] as Strategy[]).map((s) => (
          <button key={s} onClick={() => setStrategy(s)} className={`rounded-full px-4 py-1 text-sm uppercase ${s === strategy ? 'bg-teal-500 text-slate-900' : 'bg-slate-800'}`}>
            {s}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="5-yr capex" value={cad(plan.capex5)} />
        <Kpi label="5-yr TCO" value={cad(plan.tco5)} />
        <Kpi label="Risk score" value={String(Math.round(plan.risk))} />
        <Kpi label="Deferrable (12 mo)" value={cad(plan.deferrable12)} />
      </div>
      <div className="card h-80">
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid stroke="#1e293b" />
            <XAxis dataKey="year" stroke="#94a3b8" />
            <YAxis tickFormatter={(v) => cad(v, 0)} stroke="#94a3b8" fontSize={11} />
            <Tooltip formatter={(v) => cad(Number(v))} contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
            <Legend />
            {CATS.map((c, i) => (
              <Bar key={c} dataKey={c} stackId="a" fill={COLORS[i]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="card space-y-3">
        <Slider label="Annual cap ($M)" value={budgetCap} min={8} max={40} step={1} onChange={setCap} />
        <Slider label="Risk tolerance" value={riskTolerance} min={0} max={1} step={0.05} onChange={setRisk} />
      </div>
    </div>
  )
}
