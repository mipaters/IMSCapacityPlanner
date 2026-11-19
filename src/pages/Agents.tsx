import { useState } from 'react'
import { Bot, CheckCircle2, Play } from 'lucide-react'
import { AGENTS } from '../data/agents'

export default function Agents() {
  const [running, setRunning] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [shown, setShown] = useState<string[]>([])
  const run = (id: string) => {
    const a = AGENTS.find((x) => x.id === id)!
    setRunning(id)
    setActive(id)
    setShown([])
    a.trace.forEach((line, i) => setTimeout(() => setShown((s) => [...s, line]), 600 * (i + 1)))
    setTimeout(() => setRunning(null), 600 * (a.trace.length + 1))
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Agents</h1>
        <p className="text-sm text-slate-400">Six specialised agents cooperate. Calculations stay in deterministic models; agents orchestrate, explain and request approvals.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {AGENTS.map((a) => (
          <div key={a.id} className="card space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 font-medium">
                <Bot className="text-teal-400" size={18} /> {a.name}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${a.autonomy === 'Human approval' ? 'bg-amber-500/20 text-amber-300' : a.autonomy === 'Advisory' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{a.autonomy}</span>
            </div>
            <p className="text-sm text-slate-300">{a.role}</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="mb-1 text-slate-500">Inputs</div>
                <ul className="list-disc pl-4 text-slate-300">{a.inputs.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
              <div>
                <div className="mb-1 text-slate-500">Actions</div>
                <ul className="list-disc pl-4 text-slate-300">{a.actions.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            </div>
            <div className="text-xs text-slate-400">Runs on: <span className="text-slate-200">{a.azure}</span></div>
            <button onClick={() => run(a.id)} disabled={running !== null} className="flex items-center gap-1 rounded bg-teal-500 px-3 py-1 text-sm text-slate-900 disabled:opacity-40">
              <Play size={12} /> Run agent
            </button>
            {active === a.id && (
              <ul className="space-y-1 text-xs">
                {shown.map((l) => (
                  <li key={l} className="flex gap-1 text-slate-300"><CheckCircle2 size={12} className="mt-0.5 text-emerald-400" /> {l}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
