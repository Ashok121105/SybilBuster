import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'csv-parse/sync'
import { closeDatabasePool, getPool } from '../config/database.js'

interface ApplicantRecord {
  applicant_id: string
  age: string
  income: string
  employment_length: string
  loan_purpose: string
  credit_history_length: string
  previous_default: string
}

interface LoanRecord {
  application_id: string
  applicant_id: string
  loan_amount: string
  interest_rate: string
  loan_status: string
  application_date: string
}

interface RelationshipRecord {
  applicant_id: string
  device_id: string
  ip_address: string
  upi_id: string
  bank_account_id: string
  identifier_provenance: string
}

async function loadCsv<T extends object>(relativePath: string): Promise<T[]> {
  const content = await readFile(resolve(import.meta.dirname, '../../../', relativePath), 'utf8')
  return parse(content, { columns: true, bom: true, skip_empty_lines: true, trim: true }) as T[]
}

async function seedDatabase(): Promise<void> {
  const [applicants, applications, relationships] = await Promise.all([
    loadCsv<ApplicantRecord>('data/raw/applicants.csv'),
    loadCsv<LoanRecord>('data/raw/loan_applications.csv'),
    loadCsv<RelationshipRecord>('data/synthetic/relationships.csv'),
  ])
  const applicantIds = new Set(applicants.map((applicant) => applicant.applicant_id))
  const relationshipByApplicant = new Map(relationships.map((relationship) => [relationship.applicant_id, relationship]))

  if (applicantIds.size !== applicants.length || new Set(applications.map((application) => application.application_id)).size !== applications.length) {
    throw new Error('CSV import refused: duplicate applicant_id or application_id found.')
  }

  for (const relationship of relationships) {
    if (!applicantIds.has(relationship.applicant_id)) {
      throw new Error(`CSV import refused: relationship references unknown applicant ${relationship.applicant_id}.`)
    }
    if (relationship.identifier_provenance !== 'SYNTHETIC DEMO DATA') {
      throw new Error(`CSV import refused: ${relationship.applicant_id} lacks synthetic provenance.`)
    }
  }

  for (const application of applications) {
    if (!applicantIds.has(application.applicant_id)) {
      throw new Error(`CSV import refused: application references unknown applicant ${application.applicant_id}.`)
    }
    if (!relationshipByApplicant.has(application.applicant_id)) {
      throw new Error(`CSV import refused: application has no relationship record for ${application.applicant_id}.`)
    }
  }

  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    for (const applicant of applicants) {
      await client.query(
        `INSERT INTO applicants (
           applicant_id, display_name, age, income, employment_length,
           loan_purpose, credit_history_length, previous_default
         ) VALUES ($1, $1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (applicant_id) DO UPDATE SET
           display_name = EXCLUDED.display_name, age = EXCLUDED.age, income = EXCLUDED.income,
           employment_length = EXCLUDED.employment_length, loan_purpose = EXCLUDED.loan_purpose,
           credit_history_length = EXCLUDED.credit_history_length,
           previous_default = EXCLUDED.previous_default, updated_at = now()`,
        [
          applicant.applicant_id,
          Number(applicant.age),
          Number(applicant.income),
          Number(applicant.employment_length),
          applicant.loan_purpose,
          Number(applicant.credit_history_length),
          applicant.previous_default.toLowerCase() === 'true',
        ],
      )
    }

    for (const application of applications) {
      const applicant = applicants.find((record) => record.applicant_id === application.applicant_id)!
      const relationship = relationshipByApplicant.get(application.applicant_id)!
      await client.query(
        `INSERT INTO loan_applications (
           application_id, applicant_id, loan_amount, income, employment_length,
           interest_rate, loan_status, application_date,
           device_id, ip_address, upi_id, bank_account_id, identifier_provenance
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'SYNTHETIC DEMO DATA')
         ON CONFLICT (application_id) DO UPDATE SET
           applicant_id = EXCLUDED.applicant_id, loan_amount = EXCLUDED.loan_amount,
           income = EXCLUDED.income, employment_length = EXCLUDED.employment_length,
           interest_rate = EXCLUDED.interest_rate, loan_status = EXCLUDED.loan_status,
           application_date = EXCLUDED.application_date, device_id = EXCLUDED.device_id,
           ip_address = EXCLUDED.ip_address, upi_id = EXCLUDED.upi_id,
           bank_account_id = EXCLUDED.bank_account_id,
           identifier_provenance = EXCLUDED.identifier_provenance`,
        [
          application.application_id,
          application.applicant_id,
          Number(application.loan_amount),
          Number(applicant.income),
          Number(applicant.employment_length),
          Number(application.interest_rate),
          application.loan_status,
          application.application_date,
          relationship.device_id,
          relationship.ip_address,
          relationship.upi_id,
          relationship.bank_account_id,
        ],
      )
    }
    await client.query('COMMIT')
    console.info(`Seed complete: ${applicants.length} applicants, ${applications.length} loan applications, ${relationships.length} synthetic relationships.`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

try {
  await seedDatabase()
} catch (error) {
  console.error('Database seed failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabasePool()
}