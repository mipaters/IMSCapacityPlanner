export interface Agent {
  id: string
  name: string
  role: string
  inputs: string[]
  actions: string[]
  azure: string
  autonomy: 'Autonomous' | 'Human approval' | 'Advisory'
  engine: string
  trace: string[]
}

export const AGENTS: Agent[] = [
  {
    id: 'forecast',
    name: 'Demand Forecast Agent',
    role: 'Refreshes service-level BHCA and registration forecasts when drivers or calendar events change.',
    inputs: ['Subscriber & service counts (CRM/BSS)', 'Hourly IMS traffic (OSS counters)', 'Marketing & network event calendar'],
    actions: ['Retrain driver-based forecast', 'Flag anomalies and tag them to calendar events', 'Publish forecast bands to OneLake'],
    azure: 'Azure Machine Learning + Fabric',
    autonomy: 'Autonomous',
    engine: 'src/lib/forecast.ts',
    trace: ['Pulled 13 months of hourly BHCA from the data lake', 'Detected 3 anomalies; 3 explained by calendar events', 'Re-fit 8 service forecasts, last-quarter MAPE within target', 'Published new forecast version and notified Capacity Agent'],
  },
  {
    id: 'capacity',
    name: 'Capacity Dimensioning Agent',
    role: 'Applies Erlang-B, N-1 and geo-redundancy policy to every node and projects the exhaust date.',
    inputs: ['Forecast versions', 'Node inventory & licence entitlements', 'Headroom policy'],
    actions: ['Recompute N-1 utilisation per node', 'Project exhaust month per node', 'Raise capacity risk alerts'],
    azure: 'Azure Functions + Azure Data Explorer',
    autonomy: 'Autonomous',
    engine: 'src/lib/capacity.ts',
    trace: ['Loaded 44 nodes across 4 sites', 'Recomputed N-1 load with partner-site failover', 'Found nodes breaching policy within 12 months', 'Raised alerts and requested a plan from Capex Agent'],
  },
  {
    id: 'capex',
    name: 'Capex Planning Agent',
    role: 'Builds a quarter-by-quarter VNF / CNF / hybrid plan within budget and risk tolerance.',
    inputs: ['Exhaust dates', 'Unit costs & lead times', 'Budget cap and risk tolerance'],
    actions: ['Generate and compare 3 strategies', 'Identify deferrable spend', 'Draft the "defend this plan" pack'],
    azure: 'Azure OpenAI (AI Foundry) + deterministic cost model',
    autonomy: 'Human approval',
    engine: 'src/lib/capex.ts',
    trace: ['Costed VNF, CNF and hybrid strategies', 'Applied lead times and the annual cap', 'Selected hybrid; identified deferrable spend', 'Submitted plan for FP&A approval'],
  },
  {
    id: 'resilience',
    name: 'Resilience Agent',
    role: 'Runs failure scenarios against the plan and proposes configuration or capacity mitigations.',
    inputs: ['Plan and inventory', 'Scenario library', 'Overload-control settings'],
    actions: ['Simulate site loss, storms, peaks and rollbacks', 'Size mitigations vs hardware alternative', 'Open change requests for config-only fixes'],
    azure: 'Azure Container Apps + AI Foundry Agent Service',
    autonomy: 'Human approval',
    engine: 'src/lib/sim.ts',
    trace: ['Ran 7 scenarios at the planning month', 'Ranked failures by blocked calls and recovery time', 'Selected zero-capex mitigations first', 'Opened change request in ITSM for approval'],
  },
  {
    id: 'vendor',
    name: 'Vendor & Licence Agent',
    role: 'Finds stranded licences, rebalancing options and negotiation leverage across vendors.',
    inputs: ['Licence entitlements', 'Contract dates and uplifts', 'Peer benchmarks'],
    actions: ['Identify stranded licences', 'Draft procurement brief', 'Time purchases to contract windows'],
    azure: 'Azure OpenAI + Azure AI Search',
    autonomy: 'Advisory',
    engine: 'planned: src/lib/licences.ts',
    trace: ['Matched licence entitlements to required capacity at +24 months', 'Found over-licensed HSS, MRF and ENUM pools', 'Drafted rebalancing proposal and negotiation brief'],
  },
  {
    id: 'governance',
    name: 'Governance & Audit Agent',
    role: 'Records every recommendation, approval and data source so decisions are explainable.',
    inputs: ['Agent outputs', 'Approval decisions', 'Policy documents'],
    actions: ['Write immutable audit entries', 'Attach sources to each recommendation', 'Enforce approval thresholds'],
    azure: 'Microsoft Purview + Azure Monitor + Entra ID',
    autonomy: 'Autonomous',
    engine: 'planned: audit store',
    trace: ['Logged inputs, model version and policy for each run', 'Checked approver authority against Entra roles', 'Stored decision record with lineage'],
  },
]
