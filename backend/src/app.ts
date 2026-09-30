import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import type { RequestHandler } from 'express'
import { allowedOrigins } from './config/env.js'
import { applicationRouter, riskRouter } from './routes/application.routes.js'
import { graphRouter } from './routes/graph.routes.js'
import { healthRouter } from './routes/health.routes.js'
import { initializeRuntime } from './services/runtimeInitialization.service.js'
import { errorHandler, notFoundHandler } from './utils/error-handler.js'

export const app = express()

const helmetMiddleware = helmet as unknown as () => RequestHandler
app.use(helmetMiddleware())
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('CORS origin not allowed'))
    },
  }),
)
app.use(express.json({ limit: '16kb' }))
app.use((_request, _response, next) => {
  void initializeRuntime().then(
    () => next(),
    (error: unknown) => next(error),
  )
})
app.use('/api/health', healthRouter)
app.use('/api/applications', applicationRouter)
app.use('/api/risk', riskRouter)
app.use('/api/graph', graphRouter)
app.use(notFoundHandler)
app.use(errorHandler)

export default app