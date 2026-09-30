import { demoRiskRules } from '../config/env.js'
import type { RiskAssessment, RiskEvidence, RiskSignal, RiskSignalType, RiskSimulation } from '../types/application.js'
import { HttpError } from '../utils/http-error.js'
import type { ApplicationRepository } from './applicationRepository.service.js'
import { EvidenceExplanationService } from './evidenceExplanation.service.js'
import type { ApplicationGraphService } from './graph.service.js'

const sharedSignalMessages: Record<
  Extract<RiskSignalType, 'SHARED_DEVICE' | 'SHARED_UPI' | 'SHARED_BANK' | 'SHARED_IP'>,
  string
> = {
  SHARED_DEVICE: 'Device identifier also appears on another stored demo application.',
  SHARED_UPI: 'UPI identifier also appears on another stored demo application.',
  SHARED_BANK: 'Bank account identifier also appears on another stored demo application.',
  SHARED_IP: 'IP address also appears on another stored demo application.',
}

export class RiskEngineService {
  private readonly explanationService = new EvidenceExplanationService()

  constructor(
    private readonly repository: ApplicationRepository,
    private readonly graphService: ApplicationGraphService,
  ) {}

  async analyze(applicationId: string): Promise<RiskAssessment> {
    const assessment = await this.buildAssessment(applicationId)
    await this.repository.saveAssessment(assessment)
    return assessment
  }

  async simulateRemoval(applicationId: string, signalType: RiskSignalType): Promise<RiskSimulation> {
    const timestamp = new Date().toISOString()
    const original = await this.buildAssessment(applicationId, undefined, timestamp)
    const removedSignal = original.signals.find((signal) => signal.type === signalType)
    if (!removedSignal) {
      throw new HttpError(400, 'The selected signal is not present in the current assessment.')
    }

    const simulated = await this.buildAssessment(applicationId, signalType, timestamp)
    const additionallyRemovedSignals = original.signals.filter((signal) =>
      signal.type !== signalType && !simulated.signals.some((item) => item.type === signal.type),
    )

    return { original, simulated, removedSignal, additionallyRemovedSignals }
  }

  private async buildAssessment(
    applicationId: string,
    omittedSignalType?: RiskSignalType,
    timestamp = new Date().toISOString(),
  ): Promise<RiskAssessment> {
    const application = await this.repository.findById(applicationId)
    if (!application) {
      throw new HttpError(404, 'Application not found in the current in-memory session.')
    }

    const connections = await this.graphService.findConnections(application)
    const signals: RiskSignal[] = []
    const evidence: RiskEvidence[] = []
    const sharedIdentifierTypes = new Set<string>()

    for (const connection of connections) {
      if (connection.type === 'DEFAULT_HISTORY') continue
      if (connection.type === omittedSignalType) continue
      sharedIdentifierTypes.add(connection.type)
      signals.push({
        type: connection.type,
        weight: demoRiskRules.weights[connection.type],
        description: 'Suspicious network signal detected; review the supporting evidence.',
      })
      evidence.push({
        type: connection.type,
        message: `${sharedSignalMessages[connection.type as keyof typeof sharedSignalMessages]} Matched ${connection.relatedApplicationIds.length} other application(s).`,
        relatedApplicationIds: connection.relatedApplicationIds,
      })
    }

    const relatedApplicationIds = [...new Set(connections.flatMap((connection) => connection.relatedApplicationIds))]
    if (
      omittedSignalType !== 'NETWORK_CONNECTION'
      &&
      sharedIdentifierTypes.size >= 2
      && relatedApplicationIds.length >= demoRiskRules.networkMinLinkedApplications
    ) {
      signals.push({
        type: 'NETWORK_CONNECTION',
        weight: demoRiskRules.weights.NETWORK_CONNECTION,
        description: 'Connected applications share identifiers; additional verification recommended.',
      })
      evidence.push({
        type: 'NETWORK_CONNECTION',
        message: `Shared identifiers connect this application to ${relatedApplicationIds.length} other stored demo application(s).`,
        relatedApplicationIds,
      })
    }

    const hasConfiguredDefaultHistory = demoRiskRules.defaultHistoryApplicantIds.has(application.applicantId)
    const hasGraphDefaultHistory = connections.some((connection) => connection.type === 'DEFAULT_HISTORY')
    if (omittedSignalType !== 'DEFAULT_HISTORY' && (hasConfiguredDefaultHistory || hasGraphDefaultHistory)) {
      signals.push({
        type: 'DEFAULT_HISTORY',
        weight: demoRiskRules.weights.DEFAULT_HISTORY,
        description: 'Configured demo history contains a default signal; this is not a verified record.',
      })
      evidence.push({
        type: 'DEFAULT_HISTORY',
        message: hasGraphDefaultHistory
          ? 'Synthetic graph fixture marks previous_default; verify the source before any decision.'
          : 'Connected account has historical default signal in configured demo rules; verify the source before any decision.',
        relatedApplicationIds: [],
      })
    }

    const riskScore = Math.min(100, signals.reduce((total, signal) => total + signal.weight, 0))
    const riskLevel =
      riskScore >= demoRiskRules.highThreshold
        ? 'HIGH'
        : riskScore >= demoRiskRules.mediumThreshold
          ? 'MEDIUM'
          : 'LOW'

    if (signals.length === 0) {
      evidence.push({
        type: 'NETWORK_CONNECTION',
        message: 'No configured demo signals were found among the stored applications.',
        relatedApplicationIds: [],
      })
    } else {
      evidence.push({
        type: signals[0]!.type,
        message: 'Additional verification recommended; this demo assessment is not a fraud determination.',
        relatedApplicationIds: [],
      })
    }

    const assessment: RiskAssessment = {
      applicationId,
      riskLevel,
      riskScore,
      signals,
      evidence,
      timestamp,
    }

    assessment.explanation = this.explanationService.explain(assessment)
    return assessment
  }
}