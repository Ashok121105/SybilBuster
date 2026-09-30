import type { RiskSignalType } from './application.js'

export type HistoricalContextStatus = 'disabled' | 'available' | 'empty' | 'unavailable'

export interface HistoricalMemory {
  id?: string
  text: string
  metadata?: {
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
    signalTypes?: RiskSignalType[]
    identifierTypes?: Array<'SHARED_DEVICE' | 'SHARED_UPI' | 'SHARED_BANK' | 'SHARED_IP'>
  }
}

export interface HistoricalContext {
  status: HistoricalContextStatus
  memories: HistoricalMemory[]
}

export interface InvestigationResponse {
  assessment: import('./application.js').RiskAssessment
  historicalContext: HistoricalContext
}