import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'csv-parse/sync'

const projectRoot = resolve(import.meta.dirname, '..')
const issues = []
const applicantIdPattern = /^[A-Z0-9][A-Z0-9_-]{2,63}$/
const applicationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function readCsv(relativePath, requiredColumns) {
  const absolutePath = resolve(projectRoot, relativePath)
  let content
  try {
    content = readFileSync(absolutePath, 'utf8')
  } catch (error) {
    issues.push(`${relativePath}: could not read file (${error.message})`)
    return []
  }

  try {
    const [headers] = parse(content, { to_line: 1, bom: true, trim: true, skip_empty_lines: true })
    if (!headers) {
      issues.push(`${relativePath}: CSV has no header row`)
      return []
    }

    const missingColumns = requiredColumns.filter((column) => !headers.includes(column))
    if (missingColumns.length > 0) {
      issues.push(`${relativePath}: missing required columns: ${missingColumns.join(', ')}`)
      return []
    }

    const records = parse(content, {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      trim: true,
    })
    if (records.length === 0) {
      issues.push(`${relativePath}: CSV contains no data records`)
    }
    return records
  } catch (error) {
    issues.push(`${relativePath}: invalid CSV (${error.message})`)
    return []
  }
}

function checkRequiredFields(records, relativePath, requiredColumns) {
  records.forEach((record, index) => {
    for (const column of requiredColumns) {
      if (typeof record[column] !== 'string' || record[column].trim() === '') {
        issues.push(`${relativePath}: record ${index + 2} has an empty ${column}`)
      }
    }
  })
}

function checkUniqueIds(records, relativePath, column) {
  const seen = new Set()
  records.forEach((record, index) => {
    const id = record[column]
    if (seen.has(id)) {
      issues.push(`${relativePath}: duplicate ${column} at record ${index + 2}: ${id}`)
    }
    seen.add(id)
  })
}

const applicantColumns = [
  'applicant_id',
  'age',
  'income',
  'employment_length',
  'loan_purpose',
  'credit_history_length',
  'previous_default',
]
const applicationColumns = [
  'application_id',
  'applicant_id',
  'loan_amount',
  'interest_rate',
  'loan_status',
  'application_date',
]
const relationshipColumns = [
  'applicant_id',
  'device_id',
  'ip_address',
  'upi_id',
  'bank_account_id',
  'identifier_provenance',
]

const applicants = readCsv('data/raw/applicants.csv', applicantColumns)
const applications = readCsv('data/raw/loan_applications.csv', applicationColumns)
const relationships = readCsv('data/synthetic/relationships.csv', relationshipColumns)

checkRequiredFields(applicants, 'data/raw/applicants.csv', applicantColumns)
checkRequiredFields(applications, 'data/raw/loan_applications.csv', applicationColumns)
checkRequiredFields(relationships, 'data/synthetic/relationships.csv', relationshipColumns)
checkUniqueIds(applicants, 'data/raw/applicants.csv', 'applicant_id')
checkUniqueIds(applications, 'data/raw/loan_applications.csv', 'application_id')

const applicantIds = new Set(applicants.map((record) => record.applicant_id))
const relationshipApplicantIds = new Set()

for (const [index, applicant] of applicants.entries()) {
  if (!applicantIdPattern.test(applicant.applicant_id)) {
    issues.push(`data/raw/applicants.csv: invalid applicant_id at record ${index + 2}: ${applicant.applicant_id}`)
  }
}

for (const [index, application] of applications.entries()) {
  if (!applicationIdPattern.test(application.application_id)) {
    issues.push(`data/raw/loan_applications.csv: invalid UUID application_id at record ${index + 2}: ${application.application_id}`)
  }
  if (!applicantIds.has(application.applicant_id)) {
    issues.push(`data/raw/loan_applications.csv: unknown applicant_id at record ${index + 2}: ${application.applicant_id}`)
  }
}

for (const [index, relationship] of relationships.entries()) {
  if (!applicantIds.has(relationship.applicant_id)) {
    issues.push(`data/synthetic/relationships.csv: unknown applicant_id at record ${index + 2}: ${relationship.applicant_id}`)
  }
  if (relationshipApplicantIds.has(relationship.applicant_id)) {
    issues.push(`data/synthetic/relationships.csv: duplicate applicant_id at record ${index + 2}: ${relationship.applicant_id}`)
  }
  relationshipApplicantIds.add(relationship.applicant_id)

  if (relationship.identifier_provenance !== 'SYNTHETIC DEMO DATA') {
    issues.push(`data/synthetic/relationships.csv: record ${index + 2} is not marked SYNTHETIC DEMO DATA`)
  }
  for (const column of ['device_id', 'upi_id', 'bank_account_id']) {
    if (!relationship[column]?.startsWith('SYNTHETIC-DEMO-')) {
      issues.push(`data/synthetic/relationships.csv: ${column} at record ${index + 2} lacks the SYNTHETIC-DEMO- prefix`)
    }
  }
  if (!/^(192\.0\.2|198\.51\.100|203\.0\.113)\./.test(relationship.ip_address)) {
    issues.push(`data/synthetic/relationships.csv: ip_address at record ${index + 2} is outside the reserved documentation ranges`)
  }
}

if (issues.length > 0) {
  console.error(`Dataset validation failed with ${issues.length} issue(s):`)
  for (const issue of issues) console.error(`- ${issue}`)
  process.exitCode = 1
} else {
  console.log('Dataset validation passed.')
  console.log(`Applicants: ${applicants.length}`)
  console.log(`Loan applications: ${applications.length}`)
  console.log(`Synthetic relationships: ${relationships.length}`)
}