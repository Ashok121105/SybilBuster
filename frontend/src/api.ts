import type { ApplicationInput, GraphNetworkResponse, InvestigationResponse, LoanApplication, RiskAssessment, RiskSignalType, RiskSimulation } from './types'

const developmentApiUrl = import.meta.env.DEV ? 'http://localhost:4000' : ''

export const API_BASE_URL = (import.meta.env.VITE_API_URL?.trim() || developmentApiUrl).replace(/\/$/, '')
export const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL?.trim() || API_BASE_URL).replace(/\/$/, '')

if (import.meta.env.PROD && !API_BASE_URL) {
  throw new Error('VITE_API_URL must be configured for production.')
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String(payload.error)
        : `Request failed with status ${response.status}`
    throw new Error(message)
  }

  return payload as T
}

export function createApplication(input: ApplicationInput): Promise<LoanApplication> {
  return request('/api/applications', { method: 'POST', body: JSON.stringify(input) })
}

export function analyzeRisk(applicationId: string): Promise<RiskAssessment> {
  return request('/api/risk/analyze', {
    method: 'POST',
    body: JSON.stringify({ applicationId }),
  })
}

export async function checkHealth(): Promise<void> {
  await request('/api/health')
}

export function getApplicationGraph(applicationId: string): Promise<GraphNetworkResponse> {
  return request(`/api/graph/${encodeURIComponent(applicationId)}`)
}

export function listApplications(): Promise<LoanApplication[]> {
  return request('/api/applications')
}

export function simulateRisk(applicationId: string, signalType: RiskSignalType): Promise<RiskSimulation> {
  return request('/api/risk/simulate', {
    method: 'POST',
    body: JSON.stringify({ applicationId, signalType }),
  })
}

export function investigateApplication(applicationId: string): Promise<InvestigationResponse> {
  return request('/api/risk/investigate', {
    method: 'POST',
    body: JSON.stringify({ applicationId }),
  })
}