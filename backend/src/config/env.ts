import 'dotenv/config'
import { z } from 'zod'

const environmentSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(4000),
    FRONTEND_URL: z.string().optional(),
    CORS_ORIGIN: z.string().optional(),
    HINDSIGHT_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    HINDSIGHT_API_URL: z.string().url().default('https://api.hindsight.vectorize.io'),
    HINDSIGHT_API_KEY: z.string().default(''),
    HINDSIGHT_BANK_ID: z.string().trim().min(1).default('sybilbuster-demo'),
    DEMO_RISK_MEDIUM_THRESHOLD: z.coerce.number().int().min(0).max(100).default(30),
    DEMO_RISK_HIGH_THRESHOLD: z.coerce.number().int().min(1).max(100).default(65),
    DEMO_NETWORK_MIN_LINKED_APPLICATIONS: z.coerce.number().int().min(1).default(2),
    DEMO_DEFAULT_HISTORY_APPLICANT_IDS: z.string().default(''),
    DEMO_WEIGHT_SHARED_DEVICE: z.coerce.number().int().min(0).max(100).default(18),
    DEMO_WEIGHT_SHARED_UPI: z.coerce.number().int().min(0).max(100).default(20),
    DEMO_WEIGHT_SHARED_BANK: z.coerce.number().int().min(0).max(100).default(25),
    DEMO_WEIGHT_SHARED_IP: z.coerce.number().int().min(0).max(100).default(10),
    DEMO_WEIGHT_DEFAULT_HISTORY: z.coerce.number().int().min(0).max(100).default(30),
    DEMO_WEIGHT_NETWORK_CONNECTION: z.coerce.number().int().min(0).max(100).default(15),
  })
  .superRefine((environment, context) => {
    if (environment.DEMO_RISK_HIGH_THRESHOLD <= environment.DEMO_RISK_MEDIUM_THRESHOLD) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEMO_RISK_HIGH_THRESHOLD'],
        message: 'Must be greater than DEMO_RISK_MEDIUM_THRESHOLD',
      })
    }
  })

const parsedEnvironment = environmentSchema.safeParse(process.env)

if (!parsedEnvironment.success) {
  throw new Error(`Invalid environment configuration: ${parsedEnvironment.error.message}`)
}

export const environment = parsedEnvironment.data
const configuredFrontendOrigins = environment.FRONTEND_URL?.trim()
  || environment.CORS_ORIGIN?.trim()
  || 'http://localhost:5173'
export const allowedOrigins = [...new Set(configuredFrontendOrigins.split(',').map((origin) => origin.trim()).filter(Boolean))]

export const hindsightConfig = {
  enabled: environment.HINDSIGHT_ENABLED,
  apiUrl: environment.HINDSIGHT_API_URL,
  apiKey: environment.HINDSIGHT_API_KEY,
  bankId: environment.HINDSIGHT_BANK_ID,
} as const

export const demoRiskRules = {
  mediumThreshold: environment.DEMO_RISK_MEDIUM_THRESHOLD,
  highThreshold: environment.DEMO_RISK_HIGH_THRESHOLD,
  networkMinLinkedApplications: environment.DEMO_NETWORK_MIN_LINKED_APPLICATIONS,
  defaultHistoryApplicantIds: new Set(
    environment.DEMO_DEFAULT_HISTORY_APPLICANT_IDS.split(',')
      .map((applicantId) => applicantId.trim())
      .filter(Boolean),
  ),
  weights: {
    SHARED_DEVICE: environment.DEMO_WEIGHT_SHARED_DEVICE,
    SHARED_UPI: environment.DEMO_WEIGHT_SHARED_UPI,
    SHARED_BANK: environment.DEMO_WEIGHT_SHARED_BANK,
    SHARED_IP: environment.DEMO_WEIGHT_SHARED_IP,
    DEFAULT_HISTORY: environment.DEMO_WEIGHT_DEFAULT_HISTORY,
    NETWORK_CONNECTION: environment.DEMO_WEIGHT_NETWORK_CONNECTION,
  },
} as const

const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().url().refine((value) => {
      const protocol = new URL(value).protocol
      return protocol === 'postgres:' || protocol === 'postgresql:'
    }, 'DATABASE_URL must use postgres:// or postgresql://').optional(),
  ),
  PGHOST: z.string().trim().optional(),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGDATABASE: z.string().trim().optional(),
  PGUSER: z.string().trim().optional(),
  PGPASSWORD: z.string().optional(),
})

export function getDatabaseConfig(source: NodeJS.ProcessEnv = process.env) {
  const parsed = databaseEnvironmentSchema.safeParse(source)
  if (!parsed.success) {
    throw new Error(`Invalid PostgreSQL environment configuration: ${parsed.error.message}`)
  }

  const config = parsed.data
  if (config.DATABASE_URL) {
    return { connectionString: config.DATABASE_URL }
  }

  const missing = (['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'] as const).filter(
    (key) => !config[key]?.trim(),
  )
  if (missing.length > 0) {
    throw new Error(
      `PostgreSQL configuration missing: set DATABASE_URL or provide ${missing.join(', ')}.`,
    )
  }

  return {
    host: config.PGHOST,
    port: config.PGPORT,
    database: config.PGDATABASE,
    user: config.PGUSER,
    password: config.PGPASSWORD,
  }
}

export function hasPostgresConfiguration(source: NodeJS.ProcessEnv = process.env): boolean {
  if (source.DATABASE_URL?.trim()) return true
  return ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'].every((key) => source[key]?.trim())
}

const neo4jEnvironmentSchema = z.object({
  NEO4J_URI: z.string().trim().optional(),
  NEO4J_USERNAME: z.string().trim().optional(),
  NEO4J_PASSWORD: z.string().optional(),
  NEO4J_DATABASE: z.string().trim().default('neo4j'),
})

const parsedNeo4jEnvironment = neo4jEnvironmentSchema.safeParse(process.env)
if (!parsedNeo4jEnvironment.success) {
  throw new Error(`Invalid Neo4j environment configuration: ${parsedNeo4jEnvironment.error.message}`)
}

export const neo4jConfig = parsedNeo4jEnvironment.data
export const hasNeo4jConfiguration = Boolean(
  neo4jConfig.NEO4J_URI && neo4jConfig.NEO4J_USERNAME && neo4jConfig.NEO4J_PASSWORD,
)