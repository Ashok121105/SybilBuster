import { createHash } from 'node:crypto'
import { HindsightClient } from '@vectorize-io/hindsight-client'
import { hindsightConfig } from '../config/env.js'
import type { GraphNetworkResponse } from './graph.service.js'
import type { RiskAssessment, RiskSignalType } from '../types/application.js'
import type { HistoricalContext, HistoricalMemory } from '../types/historicalInvestigation.js'

const requestTimeoutMs = 2500
const memoryLimit = 5
const memoryTags = ['source:sybilbuster', 'dataset:synthetic']
const recordType = 'sybilbuster.synthetic-investigation.v1'

const sharedIdentifierTypes = ['SHARED_DEVICE', 'SHARED_UPI', 'SHARED_BANK', 'SHARED_IP'] as const
const riskSignalTypes: RiskSignalType[] = [
  ...sharedIdentifierTypes,
  'DEFAULT_HISTORY',
  'NETWORK_CONNECTION',
]

export interface HindsightMemoryConfig {
  enabled: boolean
  apiUrl: string
  apiKey: string
  bankId: string
}

type HindsightClientPort = Pick<HindsightClient, 'recall' | 'retain'>

export class HindsightMemoryService {
  private client: HindsightClientPort | undefined

  constructor(
    private readonly config: HindsightMemoryConfig,
    private readonly clientFactory: () => HindsightClientPort = () => new HindsightClient({
      baseUrl: config.apiUrl,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      maxAttempts: 1,
      userAgent: 'sybilbuster/0.1.0',
    }),
  ) {}

  get enabled(): boolean {
    return this.config.enabled
  }

  async recallHistoricalContext(
    assessment: RiskAssessment,
    graph: GraphNetworkResponse | null,
  ): Promise<HistoricalContext> {
    if (!this.config.enabled) return { status: 'disabled', memories: [] }

    try {
      const response = await this.getClient().recall(
        this.config.bankId,
        createRecallQuery(assessment, graph),
        {
          types: ['experience'],
          budget: 'low',
          maxTokens: 1200,
          tags: memoryTags,
          tagsMatch: 'all_strict',
          signal: AbortSignal.timeout(requestTimeoutMs),
        },
      )
      const memories = response.results
        .slice(0, memoryLimit)
        .flatMap(mapHistoricalMemory)

      return { status: memories.length ? 'available' : 'empty', memories }
    } catch {
      console.warn('Hindsight recall failed; historical context is unavailable.')
      return { status: 'unavailable', memories: [] }
    }
  }

  async retainInvestigation(
    applicationId: string,
    assessment: RiskAssessment,
    graph: GraphNetworkResponse | null,
  ): Promise<void> {
    if (!this.config.enabled) return

    try {
      const summary = createSanitizedSummary(assessment, graph)
      const documentId = createInvestigationDocumentId(applicationId, assessment.timestamp)
      await this.getClient().retain(
        this.config.bankId,
        JSON.stringify(summary),
        {
          timestamp: assessment.timestamp,
          context: 'Synthetic SybilBuster historical investigation',
          documentId,
          operationId: createDeterministicUuid(`operation:${documentId}`),
          async: true,
          tags: memoryTags,
          signal: AbortSignal.timeout(requestTimeoutMs),
          updateMode: 'replace',
        },
      )
    } catch {
      console.warn('Hindsight retain failed; current investigation remains available.')
    }
  }

  private getClient(): HindsightClientPort {
    this.client ??= this.clientFactory()
    return this.client
  }
}

export const hindsightMemoryService = new HindsightMemoryService(hindsightConfig)

function createSanitizedSummary(assessment: RiskAssessment, graph: GraphNetworkResponse | null) {
  const identifierTypes = [...new Set([
    ...assessment.signals.map((signal) => signal.type),
    ...(graph?.relationshipPaths.map((path) => path.identifierType) ?? []),
    ...(graph?.evidence.map((item) => item.type) ?? []),
  ].filter(isSharedIdentifierType))].sort()

  const relationshipCounts = Object.fromEntries(sharedIdentifierTypes.map((type) => [
    type,
    graph?.relationshipPaths.filter((path) => path.identifierType === type).length ?? 0,
  ]))

  const evidenceCounts: Partial<Record<RiskSignalType, number>> = {}
  for (const type of riskSignalTypes) {
    const count = assessment.evidence.filter((item) => item.type === type).length
      + (graph?.evidence.filter((item) => item.type === type).length ?? 0)
    if (count > 0) evidenceCounts[type] = count
  }

  return {
    recordType,
    synthetic: true,
    investigationTimestamp: assessment.timestamp,
    riskLevel: assessment.riskLevel,
    signalTypes: [...new Set(assessment.signals.map((signal) => signal.type))].sort(),
    identifierTypes,
    relationshipCounts,
    evidenceCounts,
  }
}

function createRecallQuery(assessment: RiskAssessment, graph: GraphNetworkResponse | null): string {
  const signalTypes = [...new Set(assessment.signals.map((signal) => signal.type))].sort()
  const identifierTypes = [...new Set([
    ...graph?.relationshipPaths.map((path) => path.identifierType) ?? [],
    ...assessment.signals.map((signal) => signal.type).filter(isSharedIdentifierType),
  ])].sort()

  return `Find previous synthetic investigations with similar signal types (${signalTypes.join(', ') || 'none'}) and shared identifier relationship patterns (${identifierTypes.join(', ') || 'none'}). Return historical investigation context only.`
}

function mapHistoricalMemory(result: HindsightClientRecallResult): HistoricalMemory[] {
  const metadata = result.metadata ?? {}
  if (metadata.recordType !== recordType || metadata.synthetic !== 'true') return []

  const riskLevel = metadata.riskLevel
  if (riskLevel !== 'LOW' && riskLevel !== 'MEDIUM' && riskLevel !== 'HIGH') return []

  const signalTypes = parseAllowedList(metadata.signalTypes, riskSignalTypes)
  const identifierTypes = parseAllowedList(metadata.identifierTypes, sharedIdentifierTypes)
  const signalSummary = signalTypes.length ? signalTypes.join(', ') : 'no detected signals'
  const identifierSummary = identifierTypes.length ? identifierTypes.join(', ') : 'no shared identifier types'

  return [{
    ...(result.id ? { id: result.id } : {}),
    text: `Previous synthetic investigation recorded ${signalSummary} and ${identifierSummary}.`,
    metadata: { riskLevel, signalTypes, identifierTypes },
  }]
}

type HindsightClientRecallResult = Awaited<ReturnType<HindsightClient['recall']>>['results'][number]

function parseAllowedList<T extends string>(value: string | undefined, allowed: readonly T[]): T[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter((entry): entry is T => typeof entry === 'string' && allowed.includes(entry as T)))].slice(0, 6)
  } catch {
    return []
  }
}

function isSharedIdentifierType(value: RiskSignalType): value is typeof sharedIdentifierTypes[number] {
  return sharedIdentifierTypes.includes(value as typeof sharedIdentifierTypes[number])
}

export function createInvestigationDocumentId(applicationId: string, timestamp: string): string {
  return `sybilbuster-${createHash('sha256').update(`${applicationId}\n${timestamp}`).digest('hex')}`
}

function createDeterministicUuid(value: string): string {
  const digits = createHash('sha256').update(value).digest('hex').slice(0, 32).split('')
  digits[12] = '5'
  digits[16] = ((Number.parseInt(digits[16]!, 16) & 0x3) | 0x8).toString(16)
  const hex = digits.join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}