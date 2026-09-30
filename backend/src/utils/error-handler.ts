import type { ErrorRequestHandler, RequestHandler } from 'express'
import { HttpError } from './http-error.js'

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({ error: 'Route not found.' })
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof HttpError) {
    response.status(error.statusCode).json({ error: error.message, ...(error.details ? { details: error.details } : {}) })
    return
  }

  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ error: 'Request body must contain valid JSON.' })
    return
  }

  if (error instanceof Error && error.message.includes('CORS')) {
    response.status(403).json({ error: 'Origin is not allowed.' })
    return
  }

  const databaseErrorCode = findDatabaseErrorCode(error)
  if (databaseErrorCode) {
    const code = databaseErrorCode
    if (code === '23505') {
      response.status(409).json({ error: 'A record with this identifier already exists.' })
      return
    }
    if (code === '23503' || code === '22P02' || code === '23514') {
      response.status(400).json({ error: 'The request references an invalid or incompatible record.' })
      return
    }
    if (code.startsWith('08') || ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', '57P01', '57P03'].includes(code)) {
      response.status(503).json({ error: 'Database unavailable. Check PostgreSQL configuration and connectivity.' })
      return
    }
  }

  console.error(error)
  response.status(500).json({ error: 'An unexpected server error occurred.' })
}

function findDatabaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  if ('code' in error && typeof error.code === 'string') return error.code
  if ('cause' in error) {
    const causeCode = findDatabaseErrorCode(error.cause)
    if (causeCode) return causeCode
  }
  if ('errors' in error && Array.isArray(error.errors)) {
    for (const nestedError of error.errors) {
      const nestedCode = findDatabaseErrorCode(nestedError)
      if (nestedCode) return nestedCode
    }
  }
  return undefined
}