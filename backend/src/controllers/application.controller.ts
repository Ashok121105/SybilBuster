import type { Request, Response, NextFunction } from 'express'
import { applicationRepository } from '../services/applicationRepository.service.js'
import { createApplicationSchema } from '../utils/application-validation.js'
import { HttpError } from '../utils/http-error.js'
import { emitSocketEvent } from '../utils/socket-events.js'

export async function listApplications(_request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json(await applicationRepository.findAll())
  } catch (error) {
    next(error)
  }
}

export async function createApplication(request: Request, response: Response, next: NextFunction): Promise<void> {
  const result = createApplicationSchema.safeParse(request.body)
  if (!result.success) {
    next(new HttpError(400, 'Invalid application payload.', result.error.flatten()))
    return
  }

  try {
    const application = await applicationRepository.create(result.data)
    emitSocketEvent(request.app, 'application.created', application)
    response.status(201).json(application)
  } catch (error) {
    next(error)
  }
}