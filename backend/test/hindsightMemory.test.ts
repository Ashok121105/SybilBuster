import assert from 'node:assert/strict'
import test from 'node:test'
import type { HindsightClient } from '@vectorize-io/hindsight-client'
import type { GraphNetworkResponse } from '../src/services/graph.service.js'
import { HindsightMemoryService, createInvestigationDocumentId } from '../src/services/hindsightMemory.service.js'
import type { RiskAssessment } from '../src/types/application.js'

const applicationId = '00000000-0000-4000-8000-000000000001'
const timestamp = '2026-01-01T00:00:00.000Z'

const assessment: RiskAssessment = {
  applicationId,
  riskLevel: 'HIGH',
  riskScore: 73,
  signals: [
    { type: 'SHARED_DEVICE', weight: 18, description: 'Sensitive device description RAW_DEVICE_VALUE' },
    { type: 'SHARED_UPI', weight: 20, description: 'Sensitive UPI description RAW_UPI_VALUE' },
  ],
  evidence: [
    { type: 'SHARED_DEVICE', message: 'RAW_IP_VALUE RAW_BANK_VALUE', relatedApplicationIds: ['RELATED_APPLICATION_ID'] },
  ],
  timestamp,
}

const graph = {
  application: {
    id: applicationId,
    applicantId: 'PRIVATE_APPLICANT_ID',
    name: 'PRIVATE_APPLICANT_NAME',
    loanAmount: 987654321,
    income: 123456789,
    employmentLength: 8,
    deviceId: 'RAW_DEVICE_VALUE',
    ipAddress: 'RAW_IP_VALUE',
    upiId: 'RAW_UPI_VALUE',
    bankAccountId: 'RAW_BANK_VALUE',
    createdAt: timestamp,
  },
  relationshipPaths: [
    { fromApplicantId: 'PRIVATE_APPLICANT_ID', toApplicantId: 'RELATED_APPLICANT_ID', applicationId: 'RELATED_APPLICATION_ID', identifierType: 'SHARED_DEVICE', identifier: 'RAW_DEVICE_VALUE' },
    { fromApplicantId: 'PRIVATE_APPLICANT_ID', toApplicantId: 'RELATED_APPLICANT_ID', applicationId: 'RELATED_APPLICATION_ID', identifierType: 'SHARED_UPI', identifier: 'RAW_UPI_VALUE' },
    { fromApplicantId: 'PRIVATE_APPLICANT_ID', toApplicantId: 'RELATED_APPLICANT_ID', applicationId: 'RELATED_APPLICATION_ID', identifierType: 'SHARED_IP', identifier: 'RAW_IP_VALUE' },
    { fromApplicantId: 'PRIVATE_APPLICANT_ID', toApplicantId: 'RELATED_APPLICANT_ID', applicationId: 'RELATED_APPLICATION_ID', identifierType: 'SHARED_BANK', identifier: 'RAW_BANK_VALUE' },
  ],
  evidence: [
    { type: 'SHARED_DEVICE', message: 'PRIVATE_APPLICANT_NAME RAW_DEVICE_VALUE', relatedApplicationIds: ['RELATED_APPLICATION_ID'] },
  ],
} as unknown as GraphNetworkResponse

const config = {
  enabled: true,
  apiUrl: 'https://api.hindsight.vectorize.io',
  apiKey: '',
  bankId: 'sybilbuster-demo',
}

function createService(options: {
  enabled?: boolean
  recall?: () => Promise<unknown>
  retain?: (args: unknown[]) => Promise<unknown>
} = {}) {
  let factoryCalls = 0
  let recallCalls = 0
  const retainCalls: unknown[][] = []
  const fakeClient = {
    recall: async (..._args: Parameters<HindsightClient['recall']>) => {
      recallCalls += 1
      return (await options.recall?.() ?? { results: [] }) as Awaited<ReturnType<HindsightClient['recall']>>
    },
    retain: async (...args: Parameters<HindsightClient['retain']>) => {
      retainCalls.push(args)
      await options.retain?.(args)
      return {} as Awaited<ReturnType<HindsightClient['retain']>>
    },
  }
  const service = new HindsightMemoryService(
    { ...config, enabled: options.enabled ?? true },
    () => {
      factoryCalls += 1
      return fakeClient as unknown as Pick<HindsightClient, 'recall' | 'retain'>
    },
  )

  return { service, getFactoryCalls: () => factoryCalls, getRecallCalls: () => recallCalls, retainCalls }
}

function historicalRecallResult(metadata: Record<string, string>) {
  return {
    results: [{ id: 'hindsight-memory-id', text: 'UNTRUSTED_RAW_RECALL_TEXT', metadata }],
  } as unknown as Awaited<ReturnType<HindsightClient['recall']>>
}

test('disabled Hindsight reports disabled without constructing a client or making requests', async () => {
  const { service, getFactoryCalls, getRecallCalls, retainCalls } = createService({ enabled: false })

  assert.deepEqual(await service.recallHistoricalContext(assessment, graph), { status: 'disabled', memories: [] })
  await service.retainInvestigation(applicationId, assessment, graph)
  assert.equal(getFactoryCalls(), 0)
  assert.equal(getRecallCalls(), 0)
  assert.equal(retainCalls.length, 0)
})

test('recall maps only SybilBuster synthetic metadata into historical context', async () => {
  const { service } = createService({
    recall: async () => historicalRecallResult({
      recordType: 'sybilbuster.synthetic-investigation.v1',
      synthetic: 'true',
      riskLevel: 'HIGH',
      signalTypes: '["SHARED_DEVICE","SHARED_UPI","NOT_A_SIGNAL"]',
      identifierTypes: '["SHARED_DEVICE","SHARED_UPI","NOT_AN_IDENTIFIER"]',
    }),
  })

  const result = await service.recallHistoricalContext(assessment, graph)
  assert.equal(result.status, 'available')
  assert.equal(result.memories.length, 1)
  assert.equal(result.memories[0]?.metadata?.riskLevel, 'HIGH')
  assert.deepEqual(result.memories[0]?.metadata?.signalTypes, ['SHARED_DEVICE', 'SHARED_UPI'])
  assert.deepEqual(result.memories[0]?.metadata?.identifierTypes, ['SHARED_DEVICE', 'SHARED_UPI'])
  assert.doesNotMatch(result.memories[0]?.text ?? '', /UNTRUSTED_RAW_RECALL_TEXT|PRIVATE_APPLICANT/)
})

test('enabled Hindsight with no matching memories returns empty', async () => {
  const { service } = createService({ recall: async () => ({ results: [] }) })

  assert.deepEqual(await service.recallHistoricalContext(assessment, graph), { status: 'empty', memories: [] })
})

test('retain payload excludes names, finances, raw identifiers, and linked application IDs', async () => {
  let retainedContent = ''
  const { service, retainCalls } = createService({
    retain: async ([, content]) => { retainedContent = String(content) },
  })

  await service.retainInvestigation(applicationId, assessment, graph)
  const [, , options] = retainCalls[0] ?? []
  const serialized = JSON.stringify({ retainedContent, options })

  for (const forbidden of [
    'PRIVATE_APPLICANT_ID',
    'PRIVATE_APPLICANT_NAME',
    'RELATED_APPLICANT_ID',
    'RELATED_APPLICATION_ID',
    'RAW_DEVICE_VALUE',
    'RAW_IP_VALUE',
    'RAW_UPI_VALUE',
    'RAW_BANK_VALUE',
    '987654321',
    '123456789',
    applicationId,
  ]) {
    assert.equal(serialized.includes(forbidden), false, `retain payload included ${forbidden}`)
  }
  assert.match(retainedContent, /"riskLevel":"HIGH"/)
  assert.match(retainedContent, /"SHARED_DEVICE"/)
  assert.match(retainedContent, /"SHARED_UPI"/)
})

test('historical memory operations do not mutate the current assessment', async () => {
  const original = structuredClone(assessment)
  const { service } = createService({
    recall: async () => historicalRecallResult({
      recordType: 'sybilbuster.synthetic-investigation.v1',
      synthetic: 'true',
      riskLevel: 'LOW',
      signalTypes: '["SHARED_IP"]',
      identifierTypes: '["SHARED_IP"]',
    }),
  })

  await service.recallHistoricalContext(assessment, graph)
  await service.retainInvestigation(applicationId, assessment, graph)
  assert.deepEqual(assessment, original)
})

test('recall failure returns unavailable rather than empty', async () => {
  const { service } = createService({ recall: async () => { throw new Error('private diagnostic') } })

  assert.deepEqual(await service.recallHistoricalContext(assessment, graph), { status: 'unavailable', memories: [] })
})

test('retain failure is swallowed so investigation response can continue', async () => {
  const { service } = createService({ retain: async () => { throw new Error('private diagnostic') } })

  await assert.doesNotReject(service.retainInvestigation(applicationId, assessment, graph))
})

test('same assessment produces stable document and async operation identifiers', async () => {
  const { service, retainCalls } = createService()

  await service.retainInvestigation(applicationId, assessment, graph)
  await service.retainInvestigation(applicationId, assessment, graph)

  const first = retainCalls[0]?.[2] as { documentId: string; operationId: string }
  const second = retainCalls[1]?.[2] as { documentId: string; operationId: string }
  assert.equal(first.documentId, second.documentId)
  assert.equal(first.operationId, second.operationId)
  assert.equal(first.documentId, createInvestigationDocumentId(applicationId, timestamp))
  assert.match(first.operationId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(first.documentId.includes(applicationId), false)
})