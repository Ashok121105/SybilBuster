import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { allowedOrigins } from './config/env.js'
import { applicationRouter, riskRouter } from './routes/application.routes.js'
import { graphRouter } from './routes/graph.routes.js'
import { healthRouter } from './routes/health.routes.js'
import { errorHandler, notFoundHandler } from './utils/error-handler.js'

export const app = express()

app.use(helmet())
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
app.use('/api/health', healthRouter)
app.use('/api/applications', applicationRouter)
app.use('/api/risk', riskRouter)
app.use('/api/graph', graphRouter)
app.use(notFoundHandler)
app.use(errorHandler)