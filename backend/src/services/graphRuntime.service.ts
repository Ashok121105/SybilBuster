import { applicationRepository } from './applicationRepository.service.js'
import { DatasetGraphService } from './graph.service.js'
import { Neo4jGraphService } from './neo4j.service.js'

export const datasetGraphService = new DatasetGraphService(applicationRepository)
export const graphService = new Neo4jGraphService(datasetGraphService, applicationRepository)