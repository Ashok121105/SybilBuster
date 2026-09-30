import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { app } from './app.js'
import { allowedOrigins, environment, hasNeo4jConfiguration, hasPostgresConfiguration } from './config/env.js'
import { closeDatabasePool, verifyDatabaseConnection } from './config/database.js'
import { applicationRepository } from './services/applicationRepository.service.js'
import { graphService } from './services/graphRuntime.service.js'

const httpServer = createServer(app)
const socketServer = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
})

app.set('io', socketServer)

socketServer.on('connection', (socket) => {
  console.info(`Live client connected: ${socket.id}`)
})

async function start(): Promise<void> {
  if (hasPostgresConfiguration()) {
    try {
      await verifyDatabaseConnection()
      console.info('PostgreSQL connected.')
    } catch (error) {
      applicationRepository.useInMemoryFallback()
      console.warn('PostgreSQL unavailable; using synthetic/in-memory application storage:', error instanceof Error ? error.message : error)
      await closeDatabasePool()
    }
  } else {
    applicationRepository.useInMemoryFallback()
    console.info('PostgreSQL is not configured; using synthetic/in-memory application storage.')
  }

  const neo4jAvailable = await graphService.initialize()
  if (!neo4jAvailable) {
    console.info(hasNeo4jConfiguration
      ? 'Neo4j is not reachable; using the synthetic/in-memory graph fallback.'
      : 'Neo4j is not configured; using the synthetic/in-memory graph fallback.')
  }
  httpServer.listen(environment.PORT, '0.0.0.0', () => {
    console.info(`SybilBuster API listening on port ${environment.PORT}.`)
  })
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    socketServer.close(() => {
      void Promise.all([closeDatabasePool(), graphService.close()]).finally(() => process.exit(0))
    })
  })
}

void start()