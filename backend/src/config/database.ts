import pg, { type Pool as PgPool } from 'pg'
import { getDatabaseConfig } from './env.js'

const { Pool } = pg
let pool: PgPool | undefined

export function getPool(): PgPool {
  if (!pool) {
    pool = new Pool({
      ...getDatabaseConfig(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
    pool.on('error', (error) => {
      console.error('Unexpected PostgreSQL pool error:', error.message)
    })
  }
  return pool
}

export async function verifyDatabaseConnection(): Promise<void> {
  await getPool().query('SELECT 1')
}

export async function closeDatabasePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = undefined
  }
}