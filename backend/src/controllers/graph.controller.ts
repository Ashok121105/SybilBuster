import type { NextFunction, Request, Response } from 'express'
import { graphService } from '../services/graphRuntime.service.js'

export async function getApplicationGraph(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const applicationId = request.params.applicationId
    const normalizedId = Array.isArray(applicationId) ? applicationId[0] : applicationId
    if (!normalizedId) throw new Error('Application ID is required.')
    response.json(await graphService.getNetwork(normalizedId))
  } catch (error) {
    next(error)
  }
}