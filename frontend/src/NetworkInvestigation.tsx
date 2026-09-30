import { useEffect, useState } from 'react'
import { Activity, Box, Clock3, FlaskConical, List, RotateCcw, Search, ShieldAlert } from 'lucide-react'
import { getApplicationGraph, investigateApplication, listApplications, simulateRisk } from './api'
import { NetworkScene } from './NetworkScene'
import { buildNetworkGraph, type NetworkNode } from './network-graph'
import type { GraphNetworkResponse, HistoricalContext, LoanApplication, RiskAssessment, RiskSignalType, RiskSimulation } from './types'
import './network-investigation.css'

type ViewMode = '3d' | 'list'

const identifierGroups = [
  { label: 'Shared device', key: 'sharedDevices' },
  { label: 'Shared IP', key: 'sharedIPs' },
  { label: 'Shared UPI', key: 'sharedUPIIdentifiers' },
  { label: 'Shared bank account', key: 'sharedBankAccounts' },
] as const

const signalLabels: Record<RiskSignalType, string> = {
  SHARED_DEVICE: 'Shared device',
  SHARED_UPI: 'Shared UPI',
  SHARED_BANK: 'Shared bank account',
  SHARED_IP: 'Shared IP',
  DEFAULT_HISTORY: 'Configured default history',
  NETWORK_CONNECTION: 'Network connection',
}

export function NetworkInvestigation({ selectedApplicationIdOverride }: { selectedApplicationIdOverride?: string }) {
  const [applications, setApplications] = useState<LoanApplication[]>([])
  const [selectedApplicationId, setSelectedApplicationId] = useState('')
  const [searchText, setSearchText] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [graph, setGraph] = useState<GraphNetworkResponse | null>(null)
  const [assessment, setAssessment] = useState<RiskAssessment | null>(null)
  const [historicalContext, setHistoricalContext] = useState<HistoricalContext | null>(null)
  const [simulationSignalType, setSimulationSignalType] = useState<RiskSignalType | ''>('')
  const [simulation, setSimulation] = useState<RiskSimulation | null>(null)
  const [simulationLoading, setSimulationLoading] = useState(false)
  const [simulationError, setSimulationError] = useState('')
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('3d')
  const [webglAvailable, setWebglAvailable] = useState(false)
  const [resetToken, setResetToken] = useState(0)
  const [loadingApplications, setLoadingApplications] = useState(true)
  const [loadingGraph, setLoadingGraph] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    try {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
        ?? canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true })
      setWebglAvailable(Boolean(context))
      context?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      setWebglAvailable(false)
    }

    void listApplications().then((result) => {
      if (!active) return
      const ordered = [...result].sort((left, right) => left.applicantId.localeCompare(right.applicantId))
      setApplications(ordered)
      if (ordered[0]) {
        setSelectedApplicationId(ordered[0].id)
        setSearchText(`${ordered[0].applicantId} · ${ordered[0].name}`)
      }
    }).catch((requestError) => {
      if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load applications.')
    }).finally(() => {
      if (active) setLoadingApplications(false)
    })

    return () => { active = false }
  }, [])

  useEffect(() => {
    if (selectedApplicationIdOverride && selectedApplicationIdOverride !== selectedApplicationId) {
      setSelectedApplicationId(selectedApplicationIdOverride)
      setSearchText(selectedApplicationIdOverride)
    }
  }, [selectedApplicationId, selectedApplicationIdOverride])

  useEffect(() => {
    if (!selectedApplicationId) return
    let active = true
    setLoadingGraph(true)
    setError('')
    setGraph(null)
    setAssessment(null)
    setHistoricalContext(null)
    setSimulationSignalType('')
    setSimulation(null)
    setSimulationError('')
    setSelectedNode(null)

    void Promise.allSettled([
      getApplicationGraph(selectedApplicationId),
      investigateApplication(selectedApplicationId),
    ]).then(([graphResult, riskResult]) => {
      if (!active) return
      if (graphResult.status === 'fulfilled') {
        setGraph(graphResult.value)
      } else {
        setError(graphResult.reason instanceof Error ? graphResult.reason.message : 'Unable to load graph data.')
      }
      if (riskResult.status === 'fulfilled') {
        setAssessment(riskResult.value.assessment)
        setHistoricalContext(riskResult.value.historicalContext)
        setSimulationSignalType(riskResult.value.assessment.signals[0]?.type ?? '')
      } else {
        setHistoricalContext({ status: 'unavailable', memories: [] })
        setError(riskResult.reason instanceof Error ? riskResult.reason.message : 'Unable to load the application investigation.')
      }
    }).finally(() => {
      if (active) setLoadingGraph(false)
    })

    return () => { active = false }
  }, [selectedApplicationId])

  const matchingApplications = searchText.trim()
    ? applications.filter((application) => `${application.applicantId} ${application.name} ${application.id}`
      .toLowerCase().includes(searchText.trim().toLowerCase()))
    : applications
  const graphModel = graph ? buildNetworkGraph(graph, assessment) : { nodes: [], edges: [] }
  const riskLevel = assessment?.riskLevel ?? 'LOW'
  const combinedEvidence = graph && assessment
    ? [...assessment.evidence, ...graph.evidence].filter((item, index, all) =>
      all.findIndex((candidate) => candidate.type === item.type && candidate.message === item.message) === index,
    )
    : graph?.evidence ?? assessment?.evidence ?? []
  const timelineEntries = graph && assessment ? [
    {
      id: 'application-created',
      timestamp: graph.application.createdAt,
      order: 0,
      title: 'Application created',
      detail: `Application ${graph.application.id} was created for applicant ${graph.application.applicantId}.`,
    },
    ...assessment.signals.map((signal, index) => ({
      id: `signal-${signal.type}`,
      timestamp: assessment.timestamp,
      order: 10 + index,
      title: `Signal detected: ${signalLabels[signal.type]}`,
      detail: `${signal.description} Configured weight: ${signal.weight}.`,
    })),
    ...graph.connectedApplicants.map((applicant, index) => ({
      id: `connected-${applicant.applicantId}`,
      timestamp: assessment.timestamp,
      order: 30 + index,
      title: `Connected applicant: ${applicant.name}`,
      detail: `Applicant ${applicant.applicantId}; ${applicant.applicationIds.length} connected application(s). Observed in the current graph query; no separate relationship timestamp is available.`,
    })),
    ...graph.relationshipPaths.map((path, index) => ({
      id: `relationship-${path.applicationId}-${path.identifierType}-${index}`,
      timestamp: assessment.timestamp,
      order: 40 + index,
      title: `Connected entity: ${signalLabels[path.identifierType]}`,
      detail: `Identifier ${path.identifier} links this application to applicant ${path.toApplicantId} via application ${path.applicationId}. Observed in the current graph query; no separate relationship timestamp is available.`,
    })),
    {
      id: 'risk-assessment',
      timestamp: assessment.timestamp,
      order: 50,
      title: 'Risk assessment completed',
      detail: `${assessment.riskLevel} risk, score ${assessment.riskScore} of 100 using the configured demo rules.`,
    },
    ...combinedEvidence.map((item, index) => ({
      id: `evidence-${item.type}-${index}`,
      timestamp: assessment.timestamp,
      order: 60 + index,
      title: `Evidence: ${signalLabels[item.type]}`,
      detail: `${item.message}${item.relatedApplicationIds.length ? ` Related applications: ${item.relatedApplicationIds.join(', ')}.` : ''}`,
    })),
  ].sort((left, right) => {
    const timeDifference = new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
    return (Number.isNaN(timeDifference) ? 0 : timeDifference) || left.order - right.order
  }) : []

  function selectApplication(application: LoanApplication) {
    setSelectedApplicationId(application.id)
    setSearchText(`${application.applicantId} · ${application.name}`)
    setSearchOpen(false)
  }

  async function runSimulation() {
    if (!selectedApplicationId || !simulationSignalType) return
    setSimulationLoading(true)
    setSimulationError('')
    try {
      setSimulation(await simulateRisk(selectedApplicationId, simulationSignalType))
    } catch (requestError) {
      setSimulation(null)
      setSimulationError(requestError instanceof Error ? requestError.message : 'Unable to run this simulation.')
    } finally {
      setSimulationLoading(false)
    }
  }

  return (
    <main className="investigation-main">
      <header className="investigation-header">
        <div>
          <div className="investigation-eyebrow"><span /> CASE WORKSPACE / NETWORK INTELLIGENCE</div>
          <h1>Network Investigation</h1>
          <p>Trace applicant relationships and inspect the evidence behind each connection.</p>
        </div>
        <div className="investigation-live"><span /> SYNTHETIC DATASET</div>
      </header>

      <section className="investigation-toolbar" aria-label="Network controls">
        <div className="application-search">
          <label htmlFor="application-search">APPLICATION SEARCH</label>
          <div className="search-input-wrap"><Search size={16} /><input
            id="application-search"
            type="search"
            role="combobox"
            aria-expanded={searchOpen}
            aria-controls="application-search-results"
            aria-autocomplete="list"
            placeholder={loadingApplications ? 'Loading applications…' : 'Search applicant or application ID'}
            value={searchText}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => {
              setSearchText(event.target.value)
              setSearchOpen(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearchOpen(false)
              if (event.key === 'Enter' && matchingApplications[0]) selectApplication(matchingApplications[0])
            }}
          /></div>
          {searchOpen && <div className="application-search-results" id="application-search-results" role="listbox">
            {matchingApplications.slice(0, 8).map((application) => (
              <button
                key={application.id}
                type="button"
                role="option"
                aria-selected={application.id === selectedApplicationId}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectApplication(application)}
              >
                <strong>{application.applicantId}</strong><span>{application.name}</span><small>{application.id}</small>
              </button>
            ))}
            {matchingApplications.length === 0 && <div className="search-empty">No matching applications</div>}
          </div>}
        </div>

        <div className="scene-controls">
          <div className="view-toggle" role="group" aria-label="Network visualization">
            <button type="button" className={viewMode === '3d' ? 'active' : ''} onClick={() => setViewMode('3d')} disabled={!webglAvailable} title={webglAvailable ? '3D view' : 'WebGL unavailable'}><Box size={15} />3D</button>
            <button type="button" className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}><List size={15} />List</button>
          </div>
          <button className="reset-view" type="button" title="Reset graph view" aria-label="Reset graph view" onClick={() => setResetToken((current) => current + 1)}><RotateCcw size={16} /></button>
        </div>
      </section>

      {error && <div className="investigation-error" role="alert"><ShieldAlert size={16} />{error}</div>}

      <div className="investigation-grid">
        <section className="network-stage-panel" aria-label="Applicant relationship network">
          <div className="network-stage-heading"><div><span>RELATIONSHIP GRAPH</span><strong>{graph ? `${graphModel.nodes.length} entities in focus` : 'Awaiting application'}</strong></div><span className="stage-mode">{viewMode === '3d' && webglAvailable ? 'WEBGL / INTERACTIVE' : '2D / ACCESSIBLE'}</span></div>
          <div className="network-stage">
            {loadingGraph || loadingApplications ? <div className="stage-state"><span className="stage-spinner" />Loading relationship evidence</div> : graph ? viewMode === '3d' && webglAvailable ? <NetworkScene
              graph={graphModel}
              resetToken={resetToken}
              onSelectNode={(nodeId) => setSelectedNode(graphModel.nodes.find((node) => node.id === nodeId) ?? null)}
            /> : <NetworkListFallback
              graph={graphModel}
              onSelectNode={setSelectedNode}
              selectedNodeId={selectedNode?.id ?? `application:${graph.application.id}`}
            /> : <div className="stage-state">Select an application to inspect its relationships.</div>}
          </div>
          <div className="network-legend" aria-label="Node type legend">
            <span><i className="legend-applicant" />Applicant</span><span><i className="legend-loan" />Loan application</span><span><i className="legend-device" />Device</span><span><i className="legend-ip" />IP</span><span><i className="legend-upi" />UPI</span><span><i className="legend-bank" />Bank account</span>
          </div>
        </section>

        <aside className="investigation-panel" aria-label="Application investigation details">
          <div className="investigation-panel-heading"><div><span>INVESTIGATION</span><h2>Case details</h2></div><Activity size={17} /></div>
          {graph ? <>
            <div className="case-identifiers"><span>APPLICATION ID</span><strong>{graph.application.id}</strong><span>APPLICANT ID</span><strong>{graph.application.applicantId}</strong></div>
            <div className={`case-risk risk-${riskLevel.toLowerCase()}`}><div><span>DEMO RISK LEVEL</span><strong>{assessment?.riskLevel ?? 'PENDING'}</strong></div><b>{assessment?.riskScore ?? '—'}<small>/100</small></b></div>

            {assessment && <section className="case-section what-if-section">
              <h3><FlaskConical size={14} /> What-if analysis <span>SIMULATION</span></h3>
              {assessment.signals.length ? <>
                <label htmlFor="simulation-signal">Remove one detected signal</label>
                <div className="simulation-controls">
                  <select id="simulation-signal" value={simulationSignalType} onChange={(event) => {
                    setSimulationSignalType(event.target.value as RiskSignalType | '')
                    setSimulation(null)
                    setSimulationError('')
                  }}>
                    {assessment.signals.map((signal) => <option key={signal.type} value={signal.type}>{signalLabels[signal.type]}</option>)}
                  </select>
                  <button type="button" onClick={() => void runSimulation()} disabled={!simulationSignalType || simulationLoading}>
                    {simulationLoading ? 'Running…' : 'Run simulation'}
                  </button>
                </div>
                {simulationError && <p className="simulation-error" role="alert">{simulationError}</p>}
                {simulation && <div className="simulation-result" aria-live="polite">
                  <div className="simulation-badge"><FlaskConical size={12} /> SIMULATION · ORIGINAL DATA UNCHANGED</div>
                  <div className="simulation-comparison">
                    <div><span>Original</span><strong>{simulation.original.riskLevel}</strong><small>{simulation.original.riskScore}/100</small></div>
                    <i aria-hidden="true">→</i>
                    <div><span>Simulated</span><strong>{simulation.simulated.riskLevel}</strong><small>{simulation.simulated.riskScore}/100</small></div>
                  </div>
                  <p><strong>{signalLabels[simulation.removedSignal.type]}</strong> caused the change. Its configured weight is {simulation.removedSignal.weight}; the simulation recalculated the remaining signals with the existing risk rules.</p>
                  {simulation.additionallyRemovedSignals.length > 0 && <p className="simulation-secondary">Removing this signal also removed {simulation.additionallyRemovedSignals.map((signal) => signalLabels[signal.type]).join(', ')} because the existing network rule no longer qualifies.</p>}
                  {simulation.original.riskScore === simulation.simulated.riskScore && <p className="simulation-secondary">The overall score is unchanged by this removal.</p>}
                </div>}
              </> : <p className="no-evidence">No detected risk signals are available to simulate.</p>}
            </section>}

            {selectedNode && <div className="selected-node-summary"><span>SELECTED NODE / {selectedNode.type.toUpperCase()}</span><strong>{selectedNode.label}</strong><small>{selectedNode.detail}</small></div>}

            <section className="case-section"><h3>Connected applicants <span>{graph.connectedApplicants.length}</span></h3>
              {graph.connectedApplicants.length ? graph.connectedApplicants.map((applicant) => <article className="connected-applicant" key={applicant.applicantId}><span className="connected-mark" /><div><strong>{applicant.name}</strong><small>{applicant.applicantId} · {applicant.applicationIds.length} application(s)</small></div></article>) : <p className="no-evidence">No connected applicants found.</p>}
            </section>

            <section className="case-section"><h3>Shared identifiers</h3>
              {identifierGroups.map((group) => {
                const values = graph[group.key]
                return <div className="identifier-group" key={group.key}><span>{group.label}</span>{values.length ? values.map((value) => <code key={value}>{value}</code>) : <small>None found</small>}</div>
              })}
            </section>

            {assessment?.explanation && <section className="case-section"><h3>Investigation summary</h3>
              <div className="explanation-summary-box">
                <p>{assessment.explanation.summary}</p>
                <ul>
                  {assessment.explanation.rationale.slice(0, 3).map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}
                </ul>
                <div className="recommendation-box">
                  <span>Recommended action</span>
                  <p>{assessment.explanation.recommendedAction}</p>
                </div>
              </div>
            </section>}

            <section className="case-section"><h3>Evidence <span>{combinedEvidence.length}</span></h3>
              {combinedEvidence.length ? combinedEvidence.map((item, index) => <article className={`case-evidence ${item.type === 'DEFAULT_HISTORY' ? 'evidence-warning' : ''}`} key={`${item.type}-${index}`}><span>{item.type.replaceAll('_', ' ')}</span><p>{item.message}</p>{item.relatedApplicationIds.length > 0 && <small>{item.relatedApplicationIds.slice(0, 3).join(' · ')}{item.relatedApplicationIds.length > 3 ? ` · +${item.relatedApplicationIds.length - 3}` : ''}</small>}</article>) : <p className="no-evidence">No evidence returned for this application.</p>}
            </section>

            <section className="case-section historical-context-section" aria-label="Historical Investigation Context">
              <h3>Historical Investigation Context <span>HISTORICAL</span></h3>
              {!historicalContext && <p className="historical-context-state">Loading historical context…</p>}
              {historicalContext?.status === 'disabled' && <p className="historical-context-state">Historical memory disabled</p>}
              {historicalContext?.status === 'unavailable' && <p className="historical-context-state">Historical memory temporarily unavailable.</p>}
              {historicalContext?.status === 'empty' && <p className="historical-context-state">No related historical investigations found.</p>}
              {historicalContext?.status === 'available' && <div className="historical-memory-list">
                <div className="historical-pattern-callout"><span />Similar historical pattern detected</div>
                {historicalContext.memories.map((memory, index) => <article className="historical-memory" key={memory.id ?? `${memory.metadata?.riskLevel}-${index}`}>
                  <strong>Previous related investigation</strong>
                  <p>{memory.text}</p>
                  {memory.metadata?.riskLevel && <div className="historical-memory-risk"><span>Historical risk</span><b>{memory.metadata.riskLevel}</b></div>}
                  {memory.metadata?.signalTypes && memory.metadata.signalTypes.length > 0 && <div className="historical-memory-tags"><span>Signals</span>{memory.metadata.signalTypes.map((type) => <code key={type}>{type}</code>)}</div>}
                  {memory.metadata?.identifierTypes && memory.metadata.identifierTypes.length > 0 && <div className="historical-memory-tags"><span>Shared identifiers</span>{memory.metadata.identifierTypes.map((type) => <code key={type}>{type}</code>)}</div>}
                </article>)}
                <p className="historical-context-disclaimer">Historical similarity is contextual evidence only and does not determine the current risk assessment.</p>
              </div>}
              {(historicalContext?.status === 'disabled' || historicalContext?.status === 'empty' || historicalContext?.status === 'unavailable') && <p className="historical-context-disclaimer">Historical context does not determine the current risk assessment.</p>}
            </section>

            <section className="case-section timeline-section">
              <h3><Clock3 size={14} /> Timeline replay <span>{timelineEntries.length}</span></h3>
              {timelineEntries.length ? <ol className="timeline-list">
                {timelineEntries.map((entry) => <li key={entry.id}>
                  <details>
                    <summary><span>{entry.title}</span><time dateTime={entry.timestamp}>{formatTimelineTime(entry.timestamp)}</time></summary>
                    <p>{entry.detail}</p>
                  </details>
                </li>)}
              </ol> : <p className="no-evidence">Timeline events are not available.</p>}
            </section>
          </> : <div className="case-placeholder">{loadingApplications ? 'Loading available applications…' : 'Choose an application to load risk and relationship evidence.'}</div>}
        </aside>
      </div>

      <footer className="investigation-footer"><span>SYBILBUSTER / NETWORK INTELLIGENCE</span><span>Demo evidence only · not a fraud determination</span></footer>
    </main>
  )
}

function formatTimelineTime(timestamp: string): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString()
}

function NetworkListFallback({ graph, onSelectNode, selectedNodeId }: {
  graph: ReturnType<typeof buildNetworkGraph>
  onSelectNode: (node: NetworkNode) => void
  selectedNodeId: string
}) {
  return (
    <div className="network-list-fallback">
      <div className="fallback-nodes">
        {graph.nodes.map((node) => <button key={node.id} type="button" className={selectedNodeId === node.id ? 'selected' : ''} onClick={() => onSelectNode(node)}>
          <i className={`fallback-dot node-${node.type.toLowerCase().replaceAll(' ', '-')}`} /><span><small>{node.type}</small><strong>{node.label}</strong></span>
        </button>)}
      </div>
      <div className="fallback-edges"><span>RELATIONSHIPS</span>
        {graph.edges.slice(0, 48).map((edge) => {
          const source = graph.nodes.find((node) => node.id === edge.source)
          const target = graph.nodes.find((node) => node.id === edge.target)
          return <div key={edge.id}><strong>{edge.type}</strong><span>{source?.label ?? edge.source}</span><i>→</i><span>{target?.label ?? edge.target}</span></div>
        })}
      </div>
    </div>
  )
}