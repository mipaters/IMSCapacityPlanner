import { NavLink, Route, Routes } from 'react-router-dom'
import { Activity, BarChart3, Bot, Layers, PlayCircle, Presentation, LineChart as LineIcon, RotateCcw, ShieldAlert, Wallet } from 'lucide-react'
import { useStore } from './store/useStore'
import Dashboard from './pages/Dashboard'
import Forecast from './pages/Forecast'
import Simulator from './pages/Simulator'
import Capex from './pages/Capex'
import Walkthrough from './pages/Walkthrough'
import Agents from './pages/Agents'
import Architecture from './pages/Architecture'
import Scenario from './pages/Scenario'

const NAV = [
  { to: '/', label: 'Executive Walkthrough', icon: Presentation },
  { to: '/scenario', label: 'Live Scenario', icon: PlayCircle },
  { to: '/agents', label: 'AI Agents', icon: Bot },
  { to: '/architecture', label: 'Architecture', icon: Layers },
  { to: '/dashboard', label: 'Capacity Dashboard', icon: BarChart3 },
  { to: '/forecast', label: 'Demand Forecast', icon: LineIcon },
  { to: '/simulator', label: 'Failure Simulator', icon: ShieldAlert },
  { to: '/capex', label: 'Capex Planner', icon: Wallet },
]

export default function App() {
  const { carrier, reset } = useStore()
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-800 bg-slate-900 p-4">
        <div className="mb-6 flex items-center gap-2 text-lg font-semibold">
          <Activity className="text-teal-400" /> CoreCapacity IQ
        </div>
        <nav className="space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-teal-500/20 text-teal-300' : 'text-slate-300 hover:bg-slate-800'}`
              }
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
        <button onClick={reset} className="mt-6 flex items-center gap-2 text-xs text-slate-400 hover:text-white">
          <RotateCcw size={12} /> Reset demo
        </button>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-1.5 text-xs text-amber-300">
          Illustrative data — synthetic inventory and traffic for {carrier}. Not real network data.
        </div>
        <div className="p-6">
          <Routes>
            <Route path="/" element={<Walkthrough />} />`n            <Route path="/dashboard" element={<Dashboard />} />`n            <Route path="/scenario" element={<Scenario />} />`n            <Route path="/agents" element={<Agents />} />`n            <Route path="/architecture" element={<Architecture />} />
            <Route path="/forecast" element={<Forecast />} />
            <Route path="/simulator" element={<Simulator />} />
            <Route path="/capex" element={<Capex />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
