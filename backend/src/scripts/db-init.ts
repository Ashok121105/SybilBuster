import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { closeDatabasePool, getPool } from '../config/database.js'

async function initializeDatabase(): Promise<void> {
  const schemaPath = resolve(import.meta.dirname, '../../database/schema.sql')
  const schema = await readFile(schemaPath, 'utf8')
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query(schema)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
  console.info('PostgreSQL schema initialized successfully.')
}

try {
  await initializeDatabase()
} catch (error) {
  console.error('Database initialization failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabasePool()
}