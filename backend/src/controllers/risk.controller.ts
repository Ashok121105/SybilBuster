import type { Request, Response, NextFunction } from 'express'
import { applicationRepository } from '../services/applicationRepository.service.js'
import { graphService } from '../services/graphRuntime.service.js'
import { hindsightMemoryService } from '../services/hindsightMemory.service.js'
import { RiskEngineService } from '../services/riskEngine.service.js'
import { analyzeRiskSchema, simulateRiskSchema } from '../utils/application-validation.js'
import { HttpError } from '../utils/http-error.js'
import { emitSocketEvent } from '../utils/socket-events.js'

const riskEngine = new RiskEngineService(
  applicationRepository,
  graphService,
)

export async function analyzeRisk(request: Request, response: Response, next: NextFunction): Promise<void> {
  const result = analyzeRiskSchema.safeParse(request.body)
  if (!result.success) {
    next(new HttpError(400, 'Invalid risk analysis payload.', result.error.flatten()))
    return
  }

  try {
    const assessment = await riskEngine.analyze(result.data.applicationId)
    emitSocketEvent(request.app, 'risk.updated', assessment)
    response.json(assessment)
  } catch (error) {
    next(error)
  }
}

export async function simulateRisk(request: Request, response: Response, next: NextFunction): Promise<void> {
  const result = simulateRiskSchema.safeParse(request.body)
  if (!result.success) {
    next(new HttpError(400, 'Invalid risk simulation payload.', result.error.flatten()))
    return
  }

  try {
    const simulation = await riskEngine.simulateRemoval(result.data.applicationId, result.data.signalType)
    response.json(simulation)
  } catch (error) {
    next(error)
  }
}

export async function investigateApplication(request: Request, response: Response, next: NextFunction): Promise<void> {
  const result = analyzeRiskSchema.safeParse(request.body)
  if (!result.success) {
    next(new HttpError(400, 'Invalid investigation payload.', result.error.flatten()))
    return
  }

  try {
    const assessment = await riskEngine.analyze(result.data.applicationId)
    emitSocketEvent(request.app, 'risk.updated', assessment)

    let graph = null
    if (hindsightMemoryService.enabled) {
      try {
        graph = await graphService.getNetwork(result.data.applicationId)
      } catch {
        // Historical recall can still use the current assessment's signal types.
      }
    }

    const historicalContext = await hindsightMemoryService.recallHistoricalContext(assessment, graph)
    void hindsightMemoryService.retainInvestigation(result.data.applicationId, assessment, graph)
    response.json({ assessment, historicalContext })
  } catch (error) {
    next(error)
  }
}