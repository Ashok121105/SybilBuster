export interface ApplicationInput {
  applicantId: string
  name: string
  loanAmount: number
  income: number
  employmentLength: number
  deviceId: string
  ipAddress: string
  upiId: string
  bankAccountId: string
}

export interface LoanApplication extends ApplicationInput {
  id: string
  createdAt: string
}

export type RiskSignalType =
  | 'SHARED_DEVICE'
  | 'SHARED_UPI'
  | 'SHARED_BANK'
  | 'SHARED_IP'
  | 'DEFAULT_HISTORY'
  | 'NETWORK_CONNECTION'

export interface RiskExplanationSignal {
  type: RiskSignalType
  label: string
  detail: string
  weight: number
  relatedApplicationIds: string[]
}

export interface RiskExplanation {
  provider: 'deterministic-evidence'
  summary: string
  rationale: string[]
  signals: RiskExplanationSignal[]
  recommendedAction: string
}

export interface RiskAssessment {
  applicationId: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  riskScore: number
  signals: Array<{ type: RiskSignalType; weight: number; description: string }>
  evidence: Array<{ type: RiskSignalType; message: string; relatedApplicationIds: string[] }>
  explanation?: RiskExplanation
  timestamp: string
}

export interface RiskSimulation {
  original: RiskAssessment
  simulated: RiskAssessment
  removedSignal: RiskAssessment['signals'][number]
  additionallyRemovedSignals: RiskAssessment['signals']
}

export type HistoricalContextStatus = 'disabled' | 'available' | 'empty' | 'unavailable'

export interface HistoricalMemory {
  id?: string
  text: string
  metadata?: {
    riskLevel?: RiskAssessment['riskLevel']
    signalTypes?: RiskSignalType[]
    identifierTypes?: Array<'SHARED_DEVICE' | 'SHARED_UPI' | 'SHARED_BANK' | 'SHARED_IP'>
  }
}

export interface HistoricalContext {
  status: HistoricalContextStatus
  memories: HistoricalMemory[]
}

export interface InvestigationResponse {
  assessment: RiskAssessment
  historicalContext: HistoricalContext
}

export interface GraphNetworkResponse {
  application: LoanApplication
  connectedApplicants: Array<{
    applicantId: string
    name: string
    applicationIds: string[]
    sharedIdentifiers: Array<{ type: Exclude<RiskSignalType, 'DEFAULT_HISTORY' | 'NETWORK_CONNECTION'>; value: string }>
  }>
  sharedDevices: string[]
  sharedIPs: string[]
  sharedUPIIdentifiers: string[]
  sharedBankAccounts: string[]
  relationshipPaths: Array<{
    fromApplicantId: string
    toApplicantId: string
    applicationId: string
    identifierType: Exclude<RiskSignalType, 'DEFAULT_HISTORY' | 'NETWORK_CONNECTION'>
    identifier: string
  }>
  evidence: Array<{ type: RiskSignalType; message: string; relatedApplicationIds: string[] }>
}

export interface LiveEvent {
  id: string
  title: string
  detail: string
  timestamp: string
}