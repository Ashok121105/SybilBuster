import { Router } from 'express'
import { verifyDatabaseConnection } from '../config/database.js'
import { hasPostgresConfiguration } from '../config/env.js'

export const healthRouter = Router()

healthRouter.get('/', async (_request, response) => {
  try {
    if (hasPostgresConfiguration()) {
      try {
        await verifyDatabaseConnection()
      } catch {
        return response.json({
          status: 'ok',
          service: 'SybilBuster API',
          mode: 'synthetic-fallback',
          database: 'unavailable',
        })
      }
    }

    response.json({
      status: 'ok',
      service: 'SybilBuster API',
      mode: hasPostgresConfiguration() ? 'database' : 'synthetic-fallback',
    })
  } catch {
    response.status(503).json({
      status: 'error',
      service: 'SybilBuster API',
      error: 'Service unavailable.',
    })
  }
})