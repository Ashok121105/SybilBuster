import type { Application } from 'express'
import type { Server } from 'socket.io'

export function emitSocketEvent(application: Application, event: string, payload: unknown): void {
  const socketServer = application.get('io') as Server | undefined
  socketServer?.emit(event, payload)
}