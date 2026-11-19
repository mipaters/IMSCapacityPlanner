import { useState } from 'react'
import { INTEGRATIONS, LAYERS, PLATFORM } from '../data/architecture'

const byId = Object.fromEntries(INTEGRATIONS.map((i) => [i.id, i]))

export default function Architecture() {
  const [sel, setSel] = useState<string | null>(null)
  const [loop, setLoop] = useState(true)
  const item = sel ? byId[sel] : null
  const layers = LAYERS.filter((l) => loop || l.id !== 'out')
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Microsoft Architecture & Integrations</h1>
          <p className="text-sm text-slate-400">Azure-native platform layered over existing network, BSS and ITSM systems. Click a third-party system to see how it connects.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Show closed loop (actions)
        </label>
      </div>
      <div className="space-y-2">
        {layers.map((l, idx) => (
          <div key={l.id}>
            <div className="card">
              <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">{l.title}</div>
              <div className="flex flex-wrap gap-2">
                {l.items.map((x) => {
                  const integ = byId[x]
                  return integ ? (
                    <button key={x} onClick={() => setSel(x)} className={`rounded-lg border px-3 py-2 text-left text-sm ${sel === x ? 'border-amber-400 bg-amber-500/20' : 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20'}`}>
                      <div>{integ.system}</div>
                      <div className="text-xs text-slate-400">{integ.vendor}</div>
                    </button>
                  ) : (
                    <div key={x} className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-100">{x}</div>
                  )
                })}
              </div>
            </div>
            {idx < layers.length - 1 && <div className="py-1 text-center text-slate-500">{l.id === 'ai' || l.id === 'exp' ? '↕' : '↓'}</div>}
          </div>
        ))}
        <div className="card">
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Security, governance & operations (cross-cutting)</div>
          <div className="flex flex-wrap gap-2">
            {PLATFORM.map((p) => (
              <div key={p} className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{p}</div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-4 text-xs text-slate-400">
        <span><span className="mr-1 inline-block h-2 w-2 bg-amber-400" />Existing 3rd-party system</span>
        <span><span className="mr-1 inline-block h-2 w-2 bg-blue-400" />Microsoft Azure service</span>
        <span><span className="mr-1 inline-block h-2 w-2 bg-emerald-400" />Governance</span>
      </div>
      <div className="card">
        <h2 className="mb-3 font-medium">Integration map</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="p-1">System</th><th className="p-1">Direction</th><th className="p-1">Azure entry point</th><th className="p-1">Data</th><th className="p-1">Protocol</th>
              </tr>
            </thead>
            <tbody>
              {INTEGRATIONS.filter((i) => loop || i.direction === 'in').map((i) => (
                <tr key={i.id} onClick={() => setSel(i.id)} className={`cursor-pointer border-t border-slate-800 ${item?.id === i.id ? 'bg-amber-500/10' : ''}`}>
                  <td className="p-1">{i.system}</td>
                  <td className="p-1">{i.direction === 'in' ? '→ Azure' : i.direction === 'out' ? 'Azure →' : '⇄'}</td>
                  <td className="p-1">{i.via}</td>
                  <td className="p-1 text-slate-300">{i.data}</td>
                  <td className="p-1 text-slate-400">{i.protocol}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
