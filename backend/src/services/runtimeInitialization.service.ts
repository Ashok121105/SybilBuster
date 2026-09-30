import { closeDatabasePool, verifyDatabaseConnection } from '../config/database.js'
import { hasNeo4jConfiguration, hasPostgresConfiguration } from '../config/env.js'
import { applicationRepository } from './applicationRepository.service.js'
import { graphService } from './graphRuntime.service.js'

let initialization: Promise<void> | undefined

export function initializeRuntime(): Promise<void> {
  initialization ??= initialize()
  return initialization
}

async function initialize(): Promise<void> {
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
}