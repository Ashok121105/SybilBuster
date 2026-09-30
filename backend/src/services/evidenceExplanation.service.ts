import type { RiskAssessment, RiskSignalType } from '../types/application.js'

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

export interface RiskExplanationProvider {
  explain(assessment: RiskAssessment): RiskExplanation
}

const signalLabels: Record<RiskSignalType, string> = {
  SHARED_DEVICE: 'Shared device',
  SHARED_UPI: 'Shared UPI',
  SHARED_BANK: 'Shared bank account',
  SHARED_IP: 'Shared IP',
  DEFAULT_HISTORY: 'Default history',
  NETWORK_CONNECTION: 'Network connection',
}

const signalDetail: Record<RiskSignalType, string> = {
  SHARED_DEVICE: 'A device identifier appears on another stored demo application.',
  SHARED_UPI: 'A UPI identifier appears on another stored demo application.',
  SHARED_BANK: 'A bank account identifier appears on another stored demo application.',
  SHARED_IP: 'An IP address appears on another stored demo application.',
  DEFAULT_HISTORY: 'A synthetic default-history signal was detected in the configured demo data.',
  NETWORK_CONNECTION: 'This application shares identifiers with multiple related applications.',
}

function recommendedActionForRiskLevel(level: RiskAssessment['riskLevel']): string {
  switch (level) {
    case 'HIGH':
      return 'Escalate for senior investigation: verify the linked identities, review the shared identifiers, and confirm whether the application should move into a deeper review queue.'
    case 'MEDIUM':
      return 'Perform manual investigation: review the matching application IDs, verify the identifiers involved, and continue monitoring until the evidence is explained.'
    default:
      return 'Continue routine monitoring and keep the evidence trail available for follow-up review.'
  }
}

export class DeterministicEvidenceExplanationProvider implements RiskExplanationProvider {
  explain(assessment: RiskAssessment): RiskExplanation {
    const signals = assessment.signals.map((signal) => {
      const relatedApplicationIds = [...new Set(
        assessment.evidence
          .filter((item) => item.type === signal.type)
          .flatMap((item) => item.relatedApplicationIds),
      )]

      return {
        type: signal.type,
        label: signalLabels[signal.type],
        detail: signal.description,
        weight: signal.weight,
        relatedApplicationIds,
      }
    })

    const summaryPrefix = `This explanation layer summarises the evidence already detected for the current risk score. This application is ${assessment.riskLevel.toLowerCase()} risk because `
    const summary = signals.length > 0
      ? `${summaryPrefix}${signals.map((signal) => `${signal.label.toLowerCase()} (${signal.weight} points)`).join(', ')}.`
      : `${summaryPrefix}no configured demo signals were detected.`

    const rationale = signals.length > 0
      ? signals.map((signal) => {
        const related = signal.relatedApplicationIds.length > 0
          ? `Matched application IDs: ${signal.relatedApplicationIds.join(', ')}.`
          : 'No related application IDs were returned for this signal.'
        return `${signal.label}: ${signal.detail} ${related}`
      })
      : ['No configured demo signals were found for this application.']

    return {
      provider: 'deterministic-evidence',
      summary,
      rationale,
      signals: signals.map((signal) => ({
        ...signal,
        detail: signalDetail[signal.type] ?? signal.detail,
      })),
      recommendedAction: recommendedActionForRiskLevel(assessment.riskLevel),
    }
  }
}

export class EvidenceExplanationService {
  constructor(private readonly provider: RiskExplanationProvider = new DeterministicEvidenceExplanationProvider()) {}

  explain(assessment: RiskAssessment): RiskExplanation {
    return this.provider.explain(assessment)
  }
}
