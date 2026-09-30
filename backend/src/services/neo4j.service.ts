import neo4j, { type Driver, type Session } from 'neo4j-driver'
import { hasNeo4jConfiguration, neo4jConfig } from '../config/env.js'
import type { ApplicationRepository } from './applicationRepository.service.js'
import {
  buildGraphNetwork,
  type ApplicationGraphService,
  type GraphNetworkResponse,
  type GraphObservation,
  type SharedIdentifierType,
} from './graph.service.js'
import { loadSyntheticGraphRows } from './syntheticDataset.js'
import type { LoanApplication, RiskSignalType } from '../types/application.js'

const schemaStatements = [
  'CREATE CONSTRAINT applicant_id_unique IF NOT EXISTS FOR (node:Applicant) REQUIRE node.applicantId IS UNIQUE',
  'CREATE CONSTRAINT application_id_unique IF NOT EXISTS FOR (node:LoanApplication) REQUIRE node.applicationId IS UNIQUE',
  'CREATE CONSTRAINT device_value_unique IF NOT EXISTS FOR (node:Device) REQUIRE node.value IS UNIQUE',
  'CREATE CONSTRAINT ip_value_unique IF NOT EXISTS FOR (node:IP) REQUIRE node.value IS UNIQUE',
  'CREATE CONSTRAINT upi_value_unique IF NOT EXISTS FOR (node:UPI) REQUIRE node.value IS UNIQUE',
  'CREATE CONSTRAINT bank_account_value_unique IF NOT EXISTS FOR (node:BankAccount) REQUIRE node.value IS UNIQUE',
  'CREATE CONSTRAINT default_history_applicant_unique IF NOT EXISTS FOR (node:DefaultHistory) REQUIRE node.applicantId IS UNIQUE',
]

const sharedRelationshipQueries: Array<{ type: SharedIdentifierType; query: string }> = [
  {
    type: 'SHARED_DEVICE',
    query: `MATCH (source:LoanApplication {applicationId: $applicationId})-[:USES_DEVICE]->(identifier:Device)<-[:USES_DEVICE]-(related:LoanApplication)<-[:APPLIED_FOR]-(applicant:Applicant)
            WHERE related.applicationId <> $applicationId AND applicant.applicantId <> $applicantId
            RETURN 'SHARED_DEVICE' AS type, identifier.value AS identifier, applicant.applicantId AS applicantId, applicant.name AS applicantName, related.applicationId AS applicationId`,
  },
  {
    type: 'SHARED_IP',
    query: `MATCH (source:LoanApplication {applicationId: $applicationId})-[:USES_IP]->(identifier:IP)<-[:USES_IP]-(related:LoanApplication)<-[:APPLIED_FOR]-(applicant:Applicant)
            WHERE related.applicationId <> $applicationId AND applicant.applicantId <> $applicantId
            RETURN 'SHARED_IP' AS type, identifier.value AS identifier, applicant.applicantId AS applicantId, applicant.name AS applicantName, related.applicationId AS applicationId`,
  },
  {
    type: 'SHARED_UPI',
    query: `MATCH (source:LoanApplication {applicationId: $applicationId})-[:USES_UPI]->(identifier:UPI)<-[:USES_UPI]-(related:LoanApplication)<-[:APPLIED_FOR]-(applicant:Applicant)
            WHERE related.applicationId <> $applicationId AND applicant.applicantId <> $applicantId
            RETURN 'SHARED_UPI' AS type, identifier.value AS identifier, applicant.applicantId AS applicantId, applicant.name AS applicantName, related.applicationId AS applicationId`,
  },
  {
    type: 'SHARED_BANK',
    query: `MATCH (source:LoanApplication {applicationId: $applicationId})-[:USES_BANK]->(identifier:BankAccount)<-[:USES_BANK]-(related:LoanApplication)<-[:APPLIED_FOR]-(applicant:Applicant)
            WHERE related.applicationId <> $applicationId AND applicant.applicantId <> $applicantId
            RETURN 'SHARED_BANK' AS type, identifier.value AS identifier, applicant.applicantId AS applicantId, applicant.name AS applicantName, related.applicationId AS applicationId`,
  },
]

export class Neo4jGraphService implements ApplicationGraphService {
  private driver: Driver | undefined
  private initialized = false

  constructor(
    private readonly fallback: ApplicationGraphService,
    private readonly repository: ApplicationRepository,
  ) {}

  get isAvailable(): boolean {
    return this.initialized && this.driver !== undefined
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) return this.isAvailable
    this.initialized = true
    if (!hasNeo4jConfiguration) return false

    try {
      this.driver = neo4j.driver(
        neo4jConfig.NEO4J_URI!,
        neo4j.auth.basic(neo4jConfig.NEO4J_USERNAME!, neo4jConfig.NEO4J_PASSWORD!),
      )
      await this.driver.verifyConnectivity()
      for (const statement of schemaStatements) await this.run(statement)
      await this.importSyntheticRelationships()
      console.info('Neo4j connected; synthetic relationships imported.')
      return true
    } catch (error) {
      console.warn('Neo4j unavailable; using the synthetic/in-memory graph fallback:', errorMessage(error))
      await this.disable()
      return false
    }
  }

  async findConnections(application: LoanApplication) {
    if (!this.isAvailable) return this.fallback.findConnections(application)
    const network = await this.getNetworkForApplication(application)
    return network.evidence.map((item) => ({
      type: item.type as SharedIdentifierType | 'DEFAULT_HISTORY',
      relatedApplicationIds: item.relatedApplicationIds,
    }))
  }

  async getNetwork(applicationId: string): Promise<GraphNetworkResponse> {
    const application = await this.repository.findById(applicationId)
    if (!application || !this.isAvailable) return this.fallback.getNetwork(applicationId)
    return this.getNetworkForApplication(application)
  }

  async close(): Promise<void> {
    const driver = this.driver
    this.driver = undefined
    if (driver) await driver.close()
  }

  private async getNetworkForApplication(application: LoanApplication): Promise<GraphNetworkResponse> {
    if (!this.driver) return this.fallback.getNetwork(application.id)
    try {
      await this.upsertApplication(application)
      const observations: GraphObservation[] = []
      for (const { query } of sharedRelationshipQueries) {
        const result = await this.run(query, {
          applicationId: application.id,
          applicantId: application.applicantId,
        })
        for (const record of result.records) {
          observations.push({
            type: record.get('type') as SharedIdentifierType,
            identifier: record.get('identifier') as string,
            applicantId: record.get('applicantId') as string,
            applicantName: record.get('applicantName') as string,
            applicationId: record.get('applicationId') as string,
          })
        }
      }
      const defaultHistory = await this.run(
        `MATCH (:Applicant {applicantId: $applicantId})-[:HAS_DEFAULT_HISTORY]->(history:DefaultHistory)
         RETURN history.applicantId AS applicantId`,
        { applicantId: application.applicantId },
      )
      return buildGraphNetwork(application, observations, defaultHistory.records.length > 0)
    } catch (error) {
      console.warn('Neo4j query failed; using the synthetic/in-memory graph fallback:', errorMessage(error))
      await this.disable()
      return this.fallback.getNetwork(application.id)
    }
  }

  private async importSyntheticRelationships(): Promise<void> {
    const rows = loadSyntheticGraphRows()
    if (rows.length === 0) return

    await this.run(
      `UNWIND $rows AS row
       MERGE (applicant:Applicant {applicantId: row.applicantId})
       SET applicant.name = row.applicantName, applicant.income = row.income,
           applicant.employmentLength = row.employmentLength
       MERGE (application:LoanApplication {applicationId: row.applicationId})
       SET application.loanAmount = row.loanAmount, application.status = row.loanStatus,
           application.createdAt = row.createdAt
       MERGE (applicant)-[:APPLIED_FOR]->(application)`,
      { rows },
    )

    const identifierImports = [
      { property: 'deviceId', label: 'Device', relationship: 'USES_DEVICE' },
      { property: 'ipAddress', label: 'IP', relationship: 'USES_IP' },
      { property: 'upiId', label: 'UPI', relationship: 'USES_UPI' },
      { property: 'bankAccountId', label: 'BankAccount', relationship: 'USES_BANK' },
    ] as const
    for (const item of identifierImports) {
      await this.run(
        `UNWIND $rows AS row
         MATCH (application:LoanApplication {applicationId: row.applicationId})
         MERGE (identifier:${item.label} {value: row.${item.property}})
         MERGE (application)-[:${item.relationship}]->(identifier)`,
        { rows },
      )
    }

    await this.run(
      `UNWIND $rows AS row
       WITH row WHERE row.hasDefaultHistory
       MATCH (applicant:Applicant {applicantId: row.applicantId})
       MERGE (history:DefaultHistory {applicantId: row.applicantId})
       SET history.source = 'synthetic dataset'
       MERGE (applicant)-[:HAS_DEFAULT_HISTORY]->(history)`,
      { rows },
    )

    const connectedToQueries = [
      ['Device', 'USES_DEVICE'],
      ['IP', 'USES_IP'],
      ['UPI', 'USES_UPI'],
      ['BankAccount', 'USES_BANK'],
    ] as const
    for (const [label, relationship] of connectedToQueries) {
      await this.run(
        `MATCH (left:Applicant)-[:APPLIED_FOR]->(:LoanApplication)-[:${relationship}]->(identifier:${label})<-[:${relationship}]-(:LoanApplication)<-[:APPLIED_FOR]-(right:Applicant)
         WHERE left.applicantId < right.applicantId
         MERGE (left)-[:CONNECTED_TO {identifierType: '${label}', identifier: identifier.value}]->(right)`,
      )
    }
  }

  private async upsertApplication(application: LoanApplication): Promise<void> {
    await this.run(
      `MERGE (applicant:Applicant {applicantId: $applicantId})
       SET applicant.name = $name
       MERGE (loan:LoanApplication {applicationId: $applicationId})
       SET loan.loanAmount = $loanAmount, loan.createdAt = $createdAt
       MERGE (applicant)-[:APPLIED_FOR]->(loan)`,
      {
        applicantId: application.applicantId,
        name: application.name,
        applicationId: application.id,
        loanAmount: application.loanAmount,
        createdAt: application.createdAt,
      },
    )

    const identifiers = [
      { value: application.deviceId, label: 'Device', relationship: 'USES_DEVICE' },
      { value: application.ipAddress, label: 'IP', relationship: 'USES_IP' },
      { value: application.upiId, label: 'UPI', relationship: 'USES_UPI' },
      { value: application.bankAccountId, label: 'BankAccount', relationship: 'USES_BANK' },
    ] as const
    for (const item of identifiers) {
      if (!item.value) continue
      await this.run(
        `MATCH (loan:LoanApplication {applicationId: $applicationId})
         MERGE (identifier:${item.label} {value: $value})
         MERGE (loan)-[:${item.relationship}]->(identifier)`,
        { applicationId: application.id, value: item.value },
      )
      await this.run(
        `MATCH (current:LoanApplication {applicationId: $applicationId})-[:${item.relationship}]->(identifier:${item.label})<-[:${item.relationship}]-(other:LoanApplication)
         MATCH (current)<-[:APPLIED_FOR]-(currentApplicant:Applicant)
         MATCH (other)<-[:APPLIED_FOR]-(otherApplicant:Applicant)
         WHERE currentApplicant.applicantId <> otherApplicant.applicantId
         WITH CASE WHEN currentApplicant.applicantId < otherApplicant.applicantId THEN currentApplicant ELSE otherApplicant END AS left,
              CASE WHEN currentApplicant.applicantId < otherApplicant.applicantId THEN otherApplicant ELSE currentApplicant END AS right,
              identifier
         MERGE (left)-[:CONNECTED_TO {identifierType: '${item.label}', identifier: identifier.value}]->(right)`,
        { applicationId: application.id },
      )
    }
  }

  private async run(query: string, parameters: Record<string, unknown> = {}) {
    if (!this.driver) throw new Error('Neo4j driver is not connected.')
    const session: Session = this.driver.session({ database: neo4jConfig.NEO4J_DATABASE })
    try {
      return await session.run(query, parameters)
    } finally {
      await session.close()
    }
  }

  private async disable(): Promise<void> {
    const driver = this.driver
    this.driver = undefined
    if (driver) await driver.close().catch(() => undefined)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const graphSignalTypes: RiskSignalType[] = [
  'SHARED_DEVICE', 'SHARED_IP', 'SHARED_UPI', 'SHARED_BANK',
]