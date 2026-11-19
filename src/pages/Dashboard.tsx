import { useMemo } from 'react'
import { FN, FN_IDS, SITES, SITE_IDS } from '../data/catalog'
import { INVENTORY, nodeName } from '../data/inventory'
import { currentUsage, exhaustMonth, ragOfN1 } from '../lib/capacity'
import { generatePlan, DEFAULT_PLAN_OPTIONS } from '../lib/capex'
import { cad, pct } from '../lib/format'
import { monthLabel, NOW } from '../lib/util'
import { useStore } from '../store/useStore'

const RAG = { green: 'bg-emerald-500/30 text-emerald-200', amber: 'bg-amber-500/30 text-amber-200', red: 'bg-red-500/40 text-red-200' }

export default function Dashboard() {
  const { drivers, policy } = useStore()
  const rows = useMemo(
    () =>
      INVENTORY.map((n) => {
        const u = currentUsage(n, drivers, policy)
        return { n, u, ex: exhaustMonth(n, drivers, policy) }
      }),
    [drivers, policy],
  )
  const plan = useMemo(() => generatePlan({ ...DEFAULT_PLAN_OPTIONS(), drivers, policy }), [drivers, policy])
  const soon = rows.filter((r) => r.ex !== null && r.ex - NOW <= 12).sort((a, b) => a.ex! - b.ex!)
  const avg = rows.reduce((a, r) => a + r.u.utilN1, 0) / rows.length

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Capacity Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Nodes monitored" value={String(rows.length)} />
        <Kpi label="Avg N-1 utilisation" value={pct(avg, 0)} />
        <Kpi label="Breaching ≤ 12 months" value={String(soon.length)} />
        <Kpi label="AI plan capex (5 yr)" value={cad(plan.capex5)} />
      </div>
      <div className="card overflow-x-auto">
        <h2 className="mb-3 font-medium">N-1 utilisation heatmap</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="p-1">Function</th>
              {SITE_IDS.map((s) => (
                <th key={s} className="p-1">{SITES[s].name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FN_IDS.map((f) => (
              <tr key={f}>
                <td className="p-1">{FN[f].short}</td>
                {SITE_IDS.map((s) => {
                  const r = rows.find((x) => x.n.fn === f && x.n.site === s)
                  if (!r) return <td key={s} />
                  return (
                    <td key={s} className="p-1">
                      <div className={`rounded px-2 py-1 text-center ${RAG[ragOfN1(r.u.utilN1, policy)]}`}>{pct(r.u.utilN1, 0)}</div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2 className="mb-3 font-medium">Exhaust timeline (next 12 months)</h2>
        {soon.length === 0 ? (
          <p className="text-sm text-slate-400">No nodes projected to breach policy in the next 12 months.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {soon.map((r) => (
              <li key={r.n.id} className="flex justify-between">
                <span>{nodeName(r.n)}</span>
                <span className="text-amber-300">{monthLabel(r.ex!)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  )
}
