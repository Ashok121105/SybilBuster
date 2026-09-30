import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { app } from '../src/app.js'
import { applicationRepository } from '../src/services/applicationRepository.service.js'
import { hindsightMemoryService } from '../src/services/hindsightMemory.service.js'

test('graph endpoint and application workflows use fixtures without Neo4j or PostgreSQL', async () => {
  applicationRepository.useInMemoryFallback()
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  try {
    const applicationListResponse = await fetch(`http://127.0.0.1:${address.port}/api/applications`)
    assert.equal(applicationListResponse.status, 200)
    const applicationList = await applicationListResponse.json() as Array<{ id: string }>
    assert.equal(applicationList.length, 12)

    const response = await fetch(`http://127.0.0.1:${address.port}/api/graph/00000000-0000-4000-8000-000000000001`)
    assert.equal(response.status, 200)
    const graph = await response.json() as {
      connectedApplicants: Array<{ applicantId: string }>
      sharedDevices: string[]
      sharedIPs: string[]
      sharedUPIIdentifiers: string[]
      sharedBankAccounts: string[]
      relationshipPaths: unknown[]
      evidence: unknown[]
    }
    assert.equal(graph.connectedApplicants.length, 2)
    assert.equal(graph.sharedDevices.length, 1)
    assert.equal(graph.sharedIPs.length, 1)
    assert.equal(graph.sharedUPIIdentifiers.length, 1)
    assert.equal(graph.sharedBankAccounts.length, 1)
    assert.ok(graph.relationshipPaths.length >= 4)
    assert.equal(graph.evidence.length, 4)

    const defaultHistoryResponse = await fetch(`http://127.0.0.1:${address.port}/api/graph/00000000-0000-4000-8000-000000000003`)
    const defaultHistoryGraph = await defaultHistoryResponse.json() as { evidence: Array<{ type: string; message: string }> }
    assert.ok(defaultHistoryGraph.evidence.some((item) => item.type === 'DEFAULT_HISTORY' && item.message.includes('Synthetic')))
    const defaultHistoryRiskResponse = await fetch(`http://127.0.0.1:${address.port}/api/risk/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ applicationId: '00000000-0000-4000-8000-000000000003' }),
    })
    const defaultHistoryRisk = await defaultHistoryRiskResponse.json() as { signals: Array<{ type: string }> }
    assert.ok(defaultHistoryRisk.signals.some((signal) => signal.type === 'DEFAULT_HISTORY'))

    const baseInput = {
      applicantId: 'LIVE-LOW-001',
      name: 'Synthetic low-risk applicant',
      loanAmount: 9000,
      income: 42000,
      employmentLength: 3,
      deviceId: 'SYNTHETIC-DEMO-DEVICE-UNIQUE-LOW',
      ipAddress: '198.51.100.240',
      upiId: 'SYNTHETIC-DEMO-UPI-UNIQUE-LOW',
      bankAccountId: 'SYNTHETIC-DEMO-BANK-UNIQUE-LOW',
    }
    const lowCreate = await fetch(`http://127.0.0.1:${address.port}/api/applications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(baseInput),
    })
    assert.equal(lowCreate.status, 201)
    const lowApplication = await lowCreate.json() as { id: string }
    const lowRisk = await fetch(`http://127.0.0.1:${address.port}/api/risk/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ applicationId: lowApplication.id }),
    })
    assert.equal(lowRisk.status, 200)
    const lowAssessment = await lowRisk.json() as { riskLevel: string; riskScore: number }
    assert.equal(lowAssessment.riskLevel, 'LOW')
    assert.equal(lowAssessment.riskScore, 0)

    const highCreate = await fetch(`http://127.0.0.1:${address.port}/api/applications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...baseInput,
        applicantId: 'LIVE-HIGH-001',
        name: 'Synthetic shared-identifier applicant',
        deviceId: 'SYNTHETIC-DEMO-DEVICE-GROUP-A',
        ipAddress: '192.0.2.10',
        upiId: 'SYNTHETIC-DEMO-UPI-GROUP-A',
        bankAccountId: 'SYNTHETIC-DEMO-BANK-GROUP-A',
      }),
    })
    assert.equal(highCreate.status, 201)
    const highApplication = await highCreate.json() as { id: string }
    const highRisk = await fetch(`http://127.0.0.1:${address.port}/api/risk/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ applicationId: highApplication.id }),
    })
    assert.equal(highRisk.status, 200)
    const highAssessment = await highRisk.json() as { riskLevel: string; riskScore: number }
    assert.equal(highAssessment.riskLevel, 'HIGH')
    assert.equal(highAssessment.riskScore, 88)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('investigation endpoint returns the current assessment and disabled historical context without Hindsight', {
  skip: hindsightMemoryService.enabled,
}, async () => {
  applicationRepository.useInMemoryFallback()
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/risk/investigate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ applicationId: '00000000-0000-4000-8000-000000000001' }),
    })
    assert.equal(response.status, 200)
    const result = await response.json() as {
      assessment: { riskScore: number; signals: Array<{ type: string }> }
      historicalContext: { status: string; memories: unknown[] }
    }
    assert.equal(Number.isFinite(result.assessment.riskScore), true)
    assert.ok(Array.isArray(result.assessment.signals))
    assert.deepEqual(result.historicalContext, { status: 'disabled', memories: [] })
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})