import type { GraphNetworkResponse, RiskAssessment, RiskSignalType } from './types'

export type NetworkNodeType =
  | 'Applicant'
  | 'Loan Application'
  | 'Device'
  | 'IP'
  | 'UPI'
  | 'Bank Account'
  | 'Default History'

export type NetworkRelationshipType =
  | 'APPLIED_FOR'
  | 'USES_DEVICE'
  | 'USES_IP'
  | 'USES_UPI'
  | 'USES_BANK'
  | 'CONNECTED_TO'
  | 'HAS_DEFAULT_HISTORY'

export interface NetworkNode {
  id: string
  type: NetworkNodeType
  label: string
  detail: string
  position: [number, number, number]
  isMain?: boolean
  isSelectedApplication?: boolean
  riskLevel?: RiskAssessment['riskLevel']
}

export interface NetworkEdge {
  id: string
  source: string
  target: string
  type: NetworkRelationshipType
}

export interface NetworkGraphModel {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
}

const identifierNodeTypes: Record<Exclude<RiskSignalType, 'DEFAULT_HISTORY' | 'NETWORK_CONNECTION'>, {
  nodeType: NetworkNodeType
  edgeType: NetworkRelationshipType
}> = {
  SHARED_DEVICE: { nodeType: 'Device', edgeType: 'USES_DEVICE' },
  SHARED_IP: { nodeType: 'IP', edgeType: 'USES_IP' },
  SHARED_UPI: { nodeType: 'UPI', edgeType: 'USES_UPI' },
  SHARED_BANK: { nodeType: 'Bank Account', edgeType: 'USES_BANK' },
}

export function buildNetworkGraph(
  network: GraphNetworkResponse,
  assessment: RiskAssessment | null,
): NetworkGraphModel {
  const nodes = new Map<string, NetworkNode>()
  const edges = new Map<string, NetworkEdge>()
  const rootApplicantId = `applicant:${network.application.applicantId}`
  const rootApplicationId = `application:${network.application.id}`

  const addNode = (node: NetworkNode) => nodes.set(node.id, node)
  const addEdge = (source: string, target: string, type: NetworkRelationshipType) => {
    const id = `${source}|${type}|${target}`
    if (!edges.has(id)) edges.set(id, { id, source, target, type })
  }

  addNode({
    id: rootApplicantId,
    type: 'Applicant',
    label: network.application.name,
    detail: network.application.applicantId,
    position: [0, 0.2, 0],
    isMain: true,
    riskLevel: assessment?.riskLevel,
  })
  addNode({
    id: rootApplicationId,
    type: 'Loan Application',
    label: network.application.id,
    detail: 'Selected application',
    position: [0, -1.25, 0.15],
    isSelectedApplication: true,
    riskLevel: assessment?.riskLevel,
  })
  addEdge(rootApplicantId, rootApplicationId, 'APPLIED_FOR')

  const applicantPositions = new Map<string, [number, number, number]>()
  const applicationOwners = new Map<string, string>()
  for (const [index, applicant] of network.connectedApplicants.entries()) {
    const angle = (Math.PI * 2 * index) / Math.max(network.connectedApplicants.length, 1) - Math.PI / 2
    const position: [number, number, number] = [Math.cos(angle) * 3.15, Math.sin(angle) * 1.9, index % 2 ? -0.55 : 0.55]
    const applicantNodeId = `applicant:${applicant.applicantId}`
    applicantPositions.set(applicant.applicantId, position)
    addNode({
      id: applicantNodeId,
      type: 'Applicant',
      label: applicant.name,
      detail: applicant.applicantId,
      position,
    })

    applicant.applicationIds.forEach((applicationId, applicationIndex) => {
      const applicationNodeId = `application:${applicationId}`
      const offset = (applicationIndex - (applicant.applicationIds.length - 1) / 2) * 0.38
      const applicationPosition: [number, number, number] = [
        position[0] * 0.78 + offset,
        position[1] * 0.78 - 0.2,
        position[2] * 0.72,
      ]
      applicationOwners.set(applicationId, applicantNodeId)
      addNode({
        id: applicationNodeId,
        type: 'Loan Application',
        label: applicationId,
        detail: `Application for ${applicant.applicantId}`,
        position: applicationPosition,
      })
      addEdge(applicantNodeId, applicationNodeId, 'APPLIED_FOR')
    })
  }

  const identifierPositions = new Map<string, [number, number, number]>()
  const ensureIdentifier = (type: keyof typeof identifierNodeTypes, value: string) => {
    const id = `identifier:${type}:${value}`
    if (!nodes.has(id)) {
      const index = identifierPositions.size
      const angle = (Math.PI * 2 * index) / 4 - Math.PI / 4
      const position: [number, number, number] = [Math.cos(angle) * 1.55, Math.sin(angle) * 1.05 + 0.1, -1.05]
      identifierPositions.set(id, position)
      addNode({
        id,
        type: identifierNodeTypes[type].nodeType,
        label: value,
        detail: identifierNodeTypes[type].nodeType,
        position,
      })
    }
    return id
  }

  const applicantNodeIdById = new Map(
    network.connectedApplicants.map((applicant) => [applicant.applicantId, `applicant:${applicant.applicantId}`]),
  )

  for (const path of network.relationshipPaths) {
    const type = path.identifierType as keyof typeof identifierNodeTypes
    const identifierId = ensureIdentifier(type, path.identifier)
    const relatedApplicationNodeId = `application:${path.applicationId}`
    addEdge(rootApplicationId, identifierId, identifierNodeTypes[type].edgeType)
    addEdge(relatedApplicationNodeId, identifierId, identifierNodeTypes[type].edgeType)

    const connectedApplicantNodeId = applicantNodeIdById.get(path.toApplicantId)
    if (connectedApplicantNodeId) addEdge(rootApplicantId, connectedApplicantNodeId, 'CONNECTED_TO')
  }

  for (const applicant of network.connectedApplicants) {
    for (const identifier of applicant.sharedIdentifiers) {
      const type = identifier.type as keyof typeof identifierNodeTypes
      const identifierId = ensureIdentifier(type, identifier.value)
      const applicantNodeId = `applicant:${applicant.applicantId}`
      const applicantApplicationIds = applicant.applicationIds
      for (const applicationId of applicantApplicationIds) {
        addEdge(`application:${applicationId}`, identifierId, identifierNodeTypes[type].edgeType)
      }
      if (!applicationOwners.has(applicantApplicationIds[0] ?? '')) {
        const position = applicantPositions.get(applicant.applicantId)
        if (position) addEdge(applicantNodeId, identifierId, 'CONNECTED_TO')
      }
    }
  }

  if (network.evidence.some((item) => item.type === 'DEFAULT_HISTORY')) {
    const defaultHistoryId = `default-history:${network.application.applicantId}`
    addNode({
      id: defaultHistoryId,
      type: 'Default History',
      label: 'Synthetic default history',
      detail: 'Unverified fixture signal',
      position: [0, 1.8, -0.65],
      riskLevel: 'HIGH',
    })
    addEdge(rootApplicantId, defaultHistoryId, 'HAS_DEFAULT_HISTORY')
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] }
}