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

export interface RiskSignal {
  type: RiskSignalType
  weight: number
  description: string
}

export interface RiskEvidence {
  type: RiskSignalType
  message: string
  relatedApplicationIds: string[]
}

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
  signals: RiskSignal[]
  evidence: RiskEvidence[]
  explanation?: RiskExplanation
  timestamp: string
}

export interface RiskSimulation {
  original: RiskAssessment
  simulated: RiskAssessment
  removedSignal: RiskSignal
  additionallyRemovedSignals: RiskSignal[]
}