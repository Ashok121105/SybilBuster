import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { app } from './app.js'
import { allowedOrigins, environment } from './config/env.js'
import { closeDatabasePool, verifyDatabaseConnection } from './config/database.js'
import { graphService } from './services/graphRuntime.service.js'
import { initializeRuntime } from './services/runtimeInitialization.service.js'

const httpServer = createServer(app)
const socketServer = new Server(httpServer, {
  path: '/api/socket-io/socket.io',
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
})

app.set('io', socketServer)

socketServer.on('connection', (socket) => {
  console.info(`Live client connected: ${socket.id}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    socketServer.close(() => {
      void Promise.all([closeDatabasePool(), graphService.close()]).finally(() => process.exit(0))
    })
  })
}

async function start(): Promise<void> {
  await initializeRuntime()
  httpServer.listen(environment.PORT, '0.0.0.0', () => {
    console.info(`SybilBuster API listening on port ${environment.PORT}.`)
  })
}

void start()

export default httpServer