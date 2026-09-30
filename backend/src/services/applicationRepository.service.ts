import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import { getPool } from '../config/database.js'
import type { ApplicationInput, LoanApplication, RiskAssessment } from '../types/application.js'
import { loadSyntheticApplications } from './syntheticDataset.js'

export class ApplicationRepository {
  private memoryOnly = false
  private readonly memoryApplications = new Map<string, LoanApplication>()
  private readonly memoryAssessments: RiskAssessment[] = []

  useInMemoryFallback(): void {
    this.memoryOnly = true
    this.memoryApplications.clear()
    for (const application of loadSyntheticApplications()) {
      this.memoryApplications.set(application.id, application)
    }
  }

  async create(input: ApplicationInput): Promise<LoanApplication> {
    if (this.memoryOnly) {
      const application: LoanApplication = {
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      }
      this.memoryApplications.set(application.id, application)
      return application
    }

    const client = await getPool().connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO applicants (applicant_id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (applicant_id) DO UPDATE
         SET display_name = EXCLUDED.display_name, updated_at = now()`,
        [input.applicantId, input.name],
      )
      const result = await client.query<LoanApplicationRow>(
        `INSERT INTO loan_applications (
           applicant_id, loan_amount, income, employment_length,
           device_id, ip_address, upi_id, bank_account_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING application_id AS id, applicant_id AS "applicantId",
           loan_amount AS "loanAmount", income, employment_length AS "employmentLength",
           device_id AS "deviceId", host(ip_address) AS "ipAddress",
           upi_id AS "upiId", bank_account_id AS "bankAccountId", created_at AS "createdAt"`,
        [
          input.applicantId,
          input.loanAmount,
          input.income,
          input.employmentLength,
          input.deviceId,
          input.ipAddress,
          input.upiId,
          input.bankAccountId,
        ],
      )
      await client.query('COMMIT')
      return mapApplication({ ...result.rows[0]!, name: input.name })
    } catch (error) {
      await rollback(client)
      throw error
    } finally {
      client.release()
    }
  }

  async findById(applicationId: string): Promise<LoanApplication | undefined> {
    if (this.memoryOnly) return this.memoryApplications.get(applicationId)

    const result = await getPool().query<LoanApplicationRow>(
      `SELECT application_id AS id, applicant_id AS "applicantId", a.display_name AS name,
         loan_amount AS "loanAmount", l.income, employment_length AS "employmentLength",
         device_id AS "deviceId", host(ip_address) AS "ipAddress",
         upi_id AS "upiId", bank_account_id AS "bankAccountId", l.created_at AS "createdAt"
       FROM loan_applications l
       JOIN applicants a USING (applicant_id)
       WHERE application_id = $1`,
      [applicationId],
    )
    return result.rows[0] ? mapApplication(result.rows[0]) : undefined
  }

  async findAll(): Promise<LoanApplication[]> {
    if (this.memoryOnly) return [...this.memoryApplications.values()]

    const result = await getPool().query<LoanApplicationRow>(
      `SELECT application_id AS id, applicant_id AS "applicantId", a.display_name AS name,
         loan_amount AS "loanAmount", l.income, employment_length AS "employmentLength",
         device_id AS "deviceId", host(ip_address) AS "ipAddress",
         upi_id AS "upiId", bank_account_id AS "bankAccountId", l.created_at AS "createdAt"
       FROM loan_applications l
       JOIN applicants a USING (applicant_id)
       ORDER BY l.created_at`,
    )
    return result.rows.map(mapApplication)
  }

  async saveAssessment(assessment: RiskAssessment): Promise<void> {
    if (this.memoryOnly) {
      this.memoryAssessments.push(assessment)
      return
    }

    const client = await getPool().connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{ assessment_id: string }>(
        `INSERT INTO risk_assessments (application_id, risk_level, risk_score, rules_version, assessed_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING assessment_id`,
        [assessment.applicationId, assessment.riskLevel, assessment.riskScore, 'demo-v1', assessment.timestamp],
      )
      const assessmentId = result.rows[0]!.assessment_id
      for (const signal of assessment.signals) {
        const evidence = assessment.evidence.filter((item) => item.type === signal.type)
        await client.query(
          `INSERT INTO risk_signals (assessment_id, signal_type, weight, description, evidence)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [assessmentId, signal.type, signal.weight, signal.description, JSON.stringify(evidence)],
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await rollback(client)
      throw error
    } finally {
      client.release()
    }
  }
}

interface LoanApplicationRow {
  id: string
  applicantId: string
  name?: string
  loanAmount: string | number
  income: string | number
  employmentLength: string | number
  deviceId: string | null
  ipAddress: string | null
  upiId: string | null
  bankAccountId: string | null
  createdAt: Date | string
}

function mapApplication(row: LoanApplicationRow): LoanApplication {
  return {
    id: row.id,
    applicantId: row.applicantId,
    name: row.name ?? '',
    loanAmount: Number(row.loanAmount),
    income: Number(row.income),
    employmentLength: Number(row.employmentLength),
    deviceId: row.deviceId ?? '',
    ipAddress: row.ipAddress ?? '',
    upiId: row.upiId ?? '',
    bankAccountId: row.bankAccountId ?? '',
    createdAt: new Date(row.createdAt).toISOString(),
  }
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined)
}

export const applicationRepository = new ApplicationRepository()