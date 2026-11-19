export interface Integration {
  id: string
  system: string
  vendor: string
  category: string
  direction: 'in' | 'out' | 'both'
  via: string
  data: string
  protocol: string
}

export const INTEGRATIONS: Integration[] = [
  { id: 'ems-eric', system: 'Ericsson EMS / ENM', vendor: 'Ericsson', category: 'Network OSS', direction: 'in', via: 'Event Hubs', data: 'Node counters, BHCA, CPU, session counts', protocol: 'PM files (SFTP) / REST / Kafka' },
  { id: 'ems-nokia', system: 'Nokia NetAct / CBND', vendor: 'Nokia', category: 'Network OSS', direction: 'in', via: 'Event Hubs', data: 'Node KPIs, alarms, licence usage', protocol: 'PM files / REST' },
  { id: 'ems-mav', system: 'Mavenir Cloud-native Mgmt', vendor: 'Mavenir', category: 'Network OSS', direction: 'in', via: 'Event Hubs', data: 'CNF metrics, pod scaling events', protocol: 'Prometheus / REST' },
  { id: 'splunk', system: 'Splunk / Netcool', vendor: 'Splunk / IBM', category: 'Assurance', direction: 'in', via: 'Event Hubs', data: 'Fault events, incident correlation', protocol: 'HEC / REST' },
  { id: 'crm', system: 'Subscriber & product catalog (BSS)', vendor: 'Amdocs / NetCracker', category: 'BSS', direction: 'in', via: 'Data Factory', data: 'Subscriber counts by service, plan launches', protocol: 'REST / batch export' },
  { id: 'licmgr', system: 'Vendor licence portals', vendor: 'All', category: 'Commercial', direction: 'in', via: 'API Management', data: 'Entitlements, expiry, usage', protocol: 'REST / CSV' },
  { id: 'itsm', system: 'ServiceNow', vendor: 'ServiceNow', category: 'ITSM', direction: 'both', via: 'Logic Apps', data: 'Change requests, incidents, CMDB nodes', protocol: 'REST (Table API)' },
  { id: 'erp', system: 'SAP S/4HANA / Coupa', vendor: 'SAP', category: 'ERP / Procurement', direction: 'out', via: 'Logic Apps', data: 'Draft purchase requisitions, capex plan lines', protocol: 'OData / IDoc' },
  { id: 'orch', system: 'MANO / orchestrator', vendor: 'Ericsson / Nokia', category: 'Orchestration', direction: 'out', via: 'Functions', data: 'Scale-out requests for CNFs (approved only)', protocol: 'ETSI SOL005 REST' },
]

export const LAYERS = [
  { id: 'src', title: 'Network & enterprise systems (3rd party)', items: ['ems-eric', 'ems-nokia', 'ems-mav', 'splunk', 'crm', 'licmgr'] },
  { id: 'ing', title: 'Ingestion & integration', items: ['Event Hubs', 'Data Factory', 'API Management', 'Logic Apps'] },
  { id: 'data', title: 'Data platform', items: ['Fabric OneLake', 'Azure Data Explorer', 'Cosmos DB', 'Azure AI Search'] },
  { id: 'ai', title: 'Intelligence & agents', items: ['Azure Machine Learning', 'Azure OpenAI / AI Foundry', 'Foundry Agent Service', 'Azure Functions'] },
  { id: 'exp', title: 'Experience', items: ['Static Web Apps (CoreCapacity IQ)', 'Power BI', 'Microsoft Teams'] },
  { id: 'out', title: 'Action systems (closed loop)', items: ['itsm', 'erp', 'orch'] },
]

export const PLATFORM = ['Microsoft Entra ID', 'Key Vault', 'Microsoft Purview', 'Azure Monitor', 'Private Link / VNet']
