import assert from 'node:assert/strict'
import test from 'node:test'
import type { ApplicationRepository } from '../src/services/applicationRepository.service.js'
import type { ApplicationGraphService, IdentifierConnection } from '../src/services/graph.service.js'
import { RiskEngineService } from '../src/services/riskEngine.service.js'
import type { LoanApplication, RiskAssessment } from '../src/types/application.js'

const application: LoanApplication = {
  id: '00000000-0000-4000-8000-000000000001',
  applicantId: 'TEST-APP-001',
  name: 'Synthetic test applicant',
  loanAmount: 10000,
  income: 45000,
  employmentLength: 3,
  deviceId: 'SYNTHETIC-DEMO-DEVICE-1',
  ipAddress: '192.0.2.10',
  upiId: 'SYNTHETIC-DEMO-UPI-1',
  bankAccountId: 'SYNTHETIC-DEMO-BANK-1',
  createdAt: '2026-01-01T00:00:00.000Z',
}

function createEngine(connections: IdentifierConnection[]) {
  let savedAssessment: RiskAssessment | undefined
  let saveCount = 0
  const repository = {
    findById: async (applicationId: string) => applicationId === application.id ? application : undefined,
    saveAssessment: async (assessment: RiskAssessment) => { savedAssessment = assessment; saveCount += 1 },
  } as unknown as ApplicationRepository
  const graphService = {
    findConnections: async () => connections,
  } as ApplicationGraphService

  return {
    engine: new RiskEngineService(repository, graphService),
    getSavedAssessment: () => savedAssessment,
    getSaveCount: () => saveCount,
  }
}

test('isolated synthetic application keeps the LOW zero-signal assessment', async () => {
  const { engine, getSavedAssessment } = createEngine([])
  const result = await engine.analyze(application.id)

  assert.equal(result.riskLevel, 'LOW')
  assert.equal(result.riskScore, 0)
  assert.equal(result.signals.length, 0)
  assert.equal(getSavedAssessment()?.applicationId, application.id)
})

test('shared identifiers preserve the HIGH 73-point evidence assessment', async () => {
  const relatedApplicationId = '00000000-0000-4000-8000-000000000002'
  const connections: IdentifierConnection[] = [
    { type: 'SHARED_DEVICE', relatedApplicationIds: [relatedApplicationId] },
    { type: 'SHARED_UPI', relatedApplicationIds: [relatedApplicationId] },
    { type: 'SHARED_BANK', relatedApplicationIds: [relatedApplicationId] },
    { type: 'SHARED_IP', relatedApplicationIds: [relatedApplicationId] },
  ]
  const { engine, getSavedAssessment } = createEngine(connections)
  const result = await engine.analyze(application.id)

  assert.equal(result.riskLevel, 'HIGH')
  assert.equal(result.riskScore, 73)
  assert.equal(result.signals.length, 4)
  assert.ok(result.evidence.some((item) => item.relatedApplicationIds.includes(relatedApplicationId)))
  assert.equal(getSavedAssessment()?.riskScore, 73)
})

test('one shared identifier stays LOW and does not create network evidence', async () => {
  const connections: IdentifierConnection[] = [
    {
      type: 'SHARED_BANK',
      relatedApplicationIds: [
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
      ],
    },
  ]
  const { engine } = createEngine(connections)
  const result = await engine.analyze(application.id)

  assert.equal(result.riskLevel, 'LOW')
  assert.equal(result.riskScore, 25)
  assert.equal(result.signals.some((signal) => signal.type === 'NETWORK_CONNECTION'), false)
})

test('multiple shared identifier types add suspicious-network evidence', async () => {
  const relatedApplicationIds = [
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
  ]
  const connections: IdentifierConnection[] = [
    { type: 'SHARED_DEVICE', relatedApplicationIds },
    { type: 'SHARED_UPI', relatedApplicationIds },
  ]
  const { engine } = createEngine(connections)
  const result = await engine.analyze(application.id)

  assert.equal(result.riskScore, 53)
  assert.ok(result.signals.some((signal) => signal.type === 'NETWORK_CONNECTION'))
  assert.ok(result.evidence.some((item) => item.type === 'NETWORK_CONNECTION'))
})

test('risk assessment exposes an evidence-based explanation summary and action', async () => {
  const relatedApplicationIds = [
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
  ]
  const connections: IdentifierConnection[] = [
    { type: 'SHARED_DEVICE', relatedApplicationIds },
    { type: 'SHARED_UPI', relatedApplicationIds },
    { type: 'DEFAULT_HISTORY', relatedApplicationIds: [] },
  ]
  const { engine } = createEngine(connections)
  const result = await engine.analyze(application.id)

  assert.ok(result.explanation)
  assert.match(result.explanation.summary, /shared device|shared upi|default history/i)
  assert.equal(result.explanation.recommendedAction.includes('investigation'), true)
  assert.ok(result.explanation.signals.some((signal) => signal.type === 'SHARED_DEVICE'))
})

test('unknown application remains a not-found error', async () => {
  const { engine } = createEngine([])
  await assert.rejects(engine.analyze('00000000-0000-4000-8000-000000000099'), { statusCode: 404 })
})

test('what-if signal removal uses configured rules without persisting either assessment', async () => {
  const relatedApplicationIds = [
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
  ]
  const { engine, getSavedAssessment, getSaveCount } = createEngine([
    { type: 'SHARED_DEVICE', relatedApplicationIds },
    { type: 'SHARED_UPI', relatedApplicationIds },
  ])

  const result = await engine.simulateRemoval(application.id, 'SHARED_DEVICE')

  assert.equal(result.original.riskScore, 53)
  assert.equal(result.original.riskLevel, 'MEDIUM')
  assert.equal(result.simulated.riskScore, 20)
  assert.equal(result.simulated.riskLevel, 'LOW')
  assert.equal(result.removedSignal.type, 'SHARED_DEVICE')
  assert.deepEqual(result.additionallyRemovedSignals.map((signal) => signal.type), ['NETWORK_CONNECTION'])
  assert.equal(getSaveCount(), 0)
  assert.equal(getSavedAssessment(), undefined)
})