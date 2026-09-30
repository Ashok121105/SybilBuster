import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import type { LoanApplication } from '../types/application.js'

type CsvRow = Record<string, string>

export interface SyntheticGraphRow {
  applicantId: string
  applicantName: string
  applicationId: string
  loanAmount: number
  income: number
  employmentLength: number
  createdAt: string
  loanStatus: string
  hasDefaultHistory: boolean
  deviceId: string
  ipAddress: string
  upiId: string
  bankAccountId: string
}

const dataRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../data')

function readCsv(relativePath: string): CsvRow[] {
  const content = readFileSync(resolve(dataRoot, relativePath), 'utf8')
  return parse(content, { columns: true, bom: true, skip_empty_lines: true, trim: true }) as CsvRow[]
}

export function loadSyntheticGraphRows(): SyntheticGraphRow[] {
  const applicants = new Map(readCsv('raw/applicants.csv').map((row) => [row.applicant_id!, row]))
  const relationships = new Map(readCsv('synthetic/relationships.csv').map((row) => [row.applicant_id!, row]))

  return readCsv('raw/loan_applications.csv').map((loan) => {
    const applicant = applicants.get(loan.applicant_id!)
    const relationship = relationships.get(loan.applicant_id!)
    if (!applicant || !relationship) {
      throw new Error(`Synthetic graph data is missing applicant ${loan.applicant_id}.`)
    }

    return {
      applicantId: loan.applicant_id!,
      applicantName: `Synthetic applicant ${loan.applicant_id!.replace('DEMO-APP-', '')}`,
      applicationId: loan.application_id!,
      loanAmount: Number(loan.loan_amount),
      income: Number(applicant.income),
      employmentLength: Number(applicant.employment_length),
      createdAt: new Date(`${loan.application_date}T00:00:00.000Z`).toISOString(),
      loanStatus: loan.loan_status!,
      hasDefaultHistory: applicant.previous_default === 'true',
      deviceId: relationship.device_id!,
      ipAddress: relationship.ip_address!,
      upiId: relationship.upi_id!,
      bankAccountId: relationship.bank_account_id!,
    }
  })
}

export function loadSyntheticApplications(): LoanApplication[] {
  return loadSyntheticGraphRows().map((row) => ({
    id: row.applicationId,
    applicantId: row.applicantId,
    name: row.applicantName,
    loanAmount: row.loanAmount,
    income: row.income,
    employmentLength: row.employmentLength,
    deviceId: row.deviceId,
    ipAddress: row.ipAddress,
    upiId: row.upiId,
    bankAccountId: row.bankAccountId,
    createdAt: row.createdAt,
  }))
}