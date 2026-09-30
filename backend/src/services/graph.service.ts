import type { ApplicationRepository } from './applicationRepository.service.js'
import type { LoanApplication, RiskEvidence, RiskSignalType } from '../types/application.js'
import { loadSyntheticApplications, loadSyntheticGraphRows } from './syntheticDataset.js'

export type SharedIdentifierType = Extract<
  RiskSignalType,
  'SHARED_DEVICE' | 'SHARED_UPI' | 'SHARED_BANK' | 'SHARED_IP'
>

const identifierFields = [
  { field: 'deviceId', type: 'SHARED_DEVICE' },
  { field: 'ipAddress', type: 'SHARED_IP' },
  { field: 'upiId', type: 'SHARED_UPI' },
  { field: 'bankAccountId', type: 'SHARED_BANK' },
] as const satisfies ReadonlyArray<{
  field: 'deviceId' | 'ipAddress' | 'upiId' | 'bankAccountId'
  type: SharedIdentifierType
}>

export interface IdentifierConnection {
  type: SharedIdentifierType | 'DEFAULT_HISTORY'
  relatedApplicationIds: string[]
}

export interface GraphObservation {
  type: SharedIdentifierType
  identifier: string
  applicantId: string
  applicantName: string
  applicationId: string
}

export interface GraphNetworkResponse {
  application: LoanApplication
  connectedApplicants: Array<{
    applicantId: string
    name: string
    applicationIds: string[]
    sharedIdentifiers: Array<{ type: SharedIdentifierType; value: string }>
  }>
  sharedDevices: string[]
  sharedIPs: string[]
  sharedUPIIdentifiers: string[]
  sharedBankAccounts: string[]
  relationshipPaths: Array<{
    fromApplicantId: string
    toApplicantId: string
    applicationId: string
    identifierType: SharedIdentifierType
    identifier: string
  }>
  evidence: RiskEvidence[]
}

export interface ApplicationGraphService {
  findConnections(application: LoanApplication): Promise<IdentifierConnection[]>
  getNetwork(applicationId: string): Promise<GraphNetworkResponse>
}

export function buildGraphNetwork(
  application: LoanApplication,
  observations: GraphObservation[],
  hasDefaultHistory = false,
): GraphNetworkResponse {
  const uniqueObservations = new Map<string, GraphObservation>()
  for (const observation of observations) {
    const key = `${observation.type}\0${observation.identifier}\0${observation.applicationId}`
    uniqueObservations.set(key, observation)
  }
  const rows = [...uniqueObservations.values()]
  const applicants = new Map<string, GraphNetworkResponse['connectedApplicants'][number]>()

  for (const row of rows) {
    let connected = applicants.get(row.applicantId)
    if (!connected) {
      connected = {
        applicantId: row.applicantId,
        name: row.applicantName,
        applicationIds: [],
        sharedIdentifiers: [],
      }
      applicants.set(row.applicantId, connected)
    }
    if (!connected.applicationIds.includes(row.applicationId)) {
      connected.applicationIds.push(row.applicationId)
    }
    if (!connected.sharedIdentifiers.some((item) => item.type === row.type && item.value === row.identifier)) {
      connected.sharedIdentifiers.push({ type: row.type, value: row.identifier })
    }
  }

  const evidence: RiskEvidence[] = identifierFields.flatMap(({ type }) => {
    const relatedApplicationIds = [...new Set(rows.filter((row) => row.type === type).map((row) => row.applicationId))]
    if (relatedApplicationIds.length === 0) return []
    const label = {
      SHARED_DEVICE: 'device',
      SHARED_IP: 'IP',
      SHARED_UPI: 'UPI',
      SHARED_BANK: 'bank account',
    }[type]
    return [{
      type,
      message: `Shared ${label} identifier matched ${relatedApplicationIds.length} other application(s) across ${new Set(rows.filter((row) => row.type === type).map((row) => row.applicantId)).size} other applicant(s).`,
      relatedApplicationIds,
    }]
  })
  if (hasDefaultHistory) {
    evidence.push({
      type: 'DEFAULT_HISTORY',
      message: 'Synthetic applicant fixture marks previous_default; verify the source before using this demo signal.',
      relatedApplicationIds: [],
    })
  }

  const valuesFor = (type: SharedIdentifierType) => [...new Set(rows
    .filter((row) => row.type === type)
    .map((row) => row.identifier))]

  return {
    application,
    connectedApplicants: [...applicants.values()],
    sharedDevices: valuesFor('SHARED_DEVICE'),
    sharedIPs: valuesFor('SHARED_IP'),
    sharedUPIIdentifiers: valuesFor('SHARED_UPI'),
    sharedBankAccounts: valuesFor('SHARED_BANK'),
    relationshipPaths: rows.map((row) => ({
      fromApplicantId: application.applicantId,
      toApplicantId: row.applicantId,
      applicationId: row.applicationId,
      identifierType: row.type,
      identifier: row.identifier,
    })),
    evidence,
  }
}

export class DatasetGraphService implements ApplicationGraphService {
  constructor(private readonly repository: ApplicationRepository) {}

  async findConnections(application: LoanApplication): Promise<IdentifierConnection[]> {
    const network = await this.getNetworkForApplication(application)
    return network.evidence.map((item) => ({
      type: item.type as SharedIdentifierType | 'DEFAULT_HISTORY',
      relatedApplicationIds: item.relatedApplicationIds,
    }))
  }

  async getNetwork(applicationId: string): Promise<GraphNetworkResponse> {
    const application = await this.repository.findById(applicationId)
    if (!application) {
      const { HttpError } = await import('../utils/http-error.js')
      throw new HttpError(404, 'Application not found in the current session or synthetic dataset.')
    }
    return this.getNetworkForApplication(application)
  }

  private async getNetworkForApplication(application: LoanApplication): Promise<GraphNetworkResponse> {
    const hasDefaultHistory = loadSyntheticGraphRows().some((row) =>
      row.applicantId === application.applicantId && row.hasDefaultHistory,
    )
    return buildGraphNetwork(application, await this.getObservations(application), hasDefaultHistory)
  }

  private async getObservations(application: LoanApplication): Promise<GraphObservation[]> {
    const candidates = new Map(loadSyntheticApplications().map((item) => [item.id, item]))
    try {
      for (const item of await this.repository.findAll()) candidates.set(item.id, item)
    } catch {
      // The checked-in synthetic fixture remains available if persistent storage is down.
    }

    const observations: GraphObservation[] = []
    for (const candidate of candidates.values()) {
      if (candidate.id === application.id || candidate.applicantId === application.applicantId) continue
      for (const { field, type } of identifierFields) {
        const value = application[field]
        if (value && candidate[field] === value) {
          observations.push({
            type,
            identifier: value,
            applicantId: candidate.applicantId,
            applicantName: candidate.name,
            applicationId: candidate.id,
          })
        }
      }
    }
    return observations
  }
}