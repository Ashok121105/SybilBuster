import { useEffect, useState, type FormEvent } from 'react'
import { io } from 'socket.io-client'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Clock3,
  Fingerprint,
  Globe2,
  Network,
  Radio,
  ScanSearch,
  Shield,
  Signal,
  Smartphone,
  WalletCards,
} from 'lucide-react'
import { analyzeRisk, checkHealth, createApplication, getApplicationGraph, listApplications, SOCKET_URL } from './api'
import { AdvancedDashboard } from './AdvancedDashboard'
import { NetworkInvestigation } from './NetworkInvestigation'
import type { ApplicationInput, GraphNetworkResponse, LiveEvent, LoanApplication, RiskAssessment, RiskSignalType } from './types'
import './graph.css'

const emptyApplication: ApplicationInput = {
  applicantId: '', name: '', loanAmount: 25000, income: 50000, employmentLength: 2,
  deviceId: '', ipAddress: '192.0.2.10', upiId: '', bankAccountId: '',
}

const signalDetails: Record<RiskSignalType, { label: string; icon: typeof Fingerprint }> = {
  SHARED_DEVICE: { label: 'Shared device', icon: Smartphone },
  SHARED_UPI: { label: 'Shared UPI', icon: WalletCards },
  SHARED_BANK: { label: 'Shared bank', icon: Building2 },
  SHARED_IP: { label: 'Shared IP', icon: Globe2 },
  DEFAULT_HISTORY: { label: 'Demo history', icon: Clock3 },
  NETWORK_CONNECTION: { label: 'Network link', icon: Signal },
}

function App() {
  const [form, setForm] = useState(emptyApplication)
  const [assessment, setAssessment] = useState<RiskAssessment | null>(null)
  const [graph, setGraph] = useState<GraphNetworkResponse | null>(null)
  const [application, setApplication] = useState<LoanApplication | null>(null)
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [apiOnline, setApiOnline] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [graphError, setGraphError] = useState('')
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null)
  const [applicationIndex, setApplicationIndex] = useState<LoanApplication[]>([])

  useEffect(() => {
    const refreshHealth = () => {
      void checkHealth().then(
        () => setApiOnline(true),
        () => setApiOnline(false),
      )
    }
    refreshHealth()
    const intervalId = window.setInterval(refreshHealth, 5000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    void listApplications().then((applications) => {
      setApplicationIndex(applications)
      if (applications.length > 0 && !selectedApplicationId) {
        setSelectedApplicationId(applications[0].id)
      }
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      path: '/api/socket-io/socket.io',
      transports: ['websocket'],
      reconnectionAttempts: 3,
    })
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', () => setConnected(false))
    socket.on('application.created', (created: LoanApplication) => {
      setEvents((current) => [{ id: crypto.randomUUID(), title: 'Application received', detail: `Record ${created.id.slice(0, 8)} added to this session`, timestamp: new Date().toISOString() }, ...current].slice(0, 6))
    })
    socket.on('risk.updated', (updated: RiskAssessment) => {
      setEvents((current) => [{ id: crypto.randomUUID(), title: 'Risk assessment ready', detail: `${updated.riskLevel} · ${updated.signals.length} signal(s)`, timestamp: updated.timestamp }, ...current].slice(0, 6))
    })
    return () => {
      socket.disconnect()
    }
  }, [])

  async function loadApplicationSummary(applicationId: string) {
    const matchedApplication = applicationIndex.find((item) => item.id === applicationId) ?? application
    if (matchedApplication) setApplication(matchedApplication)
    setSelectedApplicationId(applicationId)
    setAssessment(null)
    setGraph(null)
    setGraphError('')

    try {
      const nextAssessment = await analyzeRisk(applicationId)
      setAssessment(nextAssessment)
      try {
        setGraph(await getApplicationGraph(applicationId))
      } catch (graphFetchError) {
        setGraphError(graphFetchError instanceof Error ? graphFetchError.message : 'Network details are unavailable.')
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to load this application.')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setAssessment(null)
    setGraph(null)
    setGraphError('')
    try {
      const created = await createApplication(form)
      setApplication(created)
      setSelectedApplicationId(created.id)
      setApplicationIndex((current) => [created, ...current])
      setAssessment(await analyzeRisk(created.id))
      try {
        setGraph(await getApplicationGraph(created.id))
      } catch (graphFetchError) {
        setGraphError(graphFetchError instanceof Error ? graphFetchError.message : 'Network details are unavailable.')
      }
      setApiOnline(true)
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to complete this request.')
    } finally {
      setSubmitting(false)
    }
  }

  function updateField<K extends keyof ApplicationInput>(field: K, value: ApplicationInput[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#dashboard" aria-label="SybilBuster home"><span className="brand-mark"><Shield size={21} strokeWidth={2.2} /></span><span>sybil<span className="brand-light">buster</span></span></a>
        <div className="workspace-label">WORKSPACE</div>
        <a className="nav-item nav-active" href="#dashboard"><Activity size={17} /> Overview</a>
        <div className="sidebar-spacer" />
        <div className="sidebar-status"><span className={`status-dot ${apiOnline ? 'online' : ''}`} /><span>{apiOnline ? 'API connected' : 'API unavailable'}</span></div>
        <div className="sidebar-foot">DEMO ENVIRONMENT<br /><span>In-memory session</span></div>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar"><div className="breadcrumb">Risk operations <span>/</span> Overview</div><div className="topbar-right"><span className="demo-tag"><span /> DEMO MODE</span><span className="avatar">SB</span></div></header>
        <section className="page-intro">
          <div><div className="eyebrow"><span className="eyebrow-line" /> DISTRIBUTED LENDING RISK</div><h1>Application overview</h1><p className="intro-copy">Review relationship signals with context, not verdicts.</p></div>
          <div className="session-chip"><span className="session-pulse" /> Live session <span className="chip-divider" /> {connected ? 'Socket connected' : 'Socket offline'}</div>
        </section>
        <AdvancedDashboard applications={applicationIndex} selectedApplicationId={selectedApplicationId ?? undefined} onSelectApplication={loadApplicationSummary} />
        <section className="summary-strip" aria-label="System summary">
          <div className="summary-cell"><span className="summary-icon"><ScanSearch size={17} /></span><div><span className="summary-label">ANALYSIS MODEL</span><strong>Configurable demo rules</strong></div></div>
          <div className="summary-cell"><span className="summary-icon green"><Radio size={17} /></span><div><span className="summary-label">LIVE EVENTS</span><strong>{connected ? 'Receiving updates' : 'Waiting for connection'}</strong></div></div>
          <div className="summary-cell"><span className="summary-icon amber"><Clock3 size={17} /></span><div><span className="summary-label">DATA RETENTION</span><strong>Current process only</strong></div></div>
        </section>

        <div className="workspace-grid">
          <section className="form-panel panel">
            <div className="panel-heading"><div><div className="section-kicker">01 / SUBMISSION</div><h2>New application</h2></div><span className="panel-icon"><Fingerprint size={19} /></span></div>
            <p className="panel-description">Enter synthetic test values to create an application and run a demo assessment.</p>
            <form className="application-form" onSubmit={handleSubmit}>
              <div className="field-row">
                <label>Applicant ID<input required maxLength={128} value={form.applicantId} onChange={(event) => updateField('applicantId', event.target.value)} placeholder="SYNTH-001" /></label>
                <label>Applicant name<input required maxLength={160} value={form.name} onChange={(event) => updateField('name', event.target.value)} placeholder="Synthetic applicant" /></label>
              </div>
              <div className="field-row field-row-numbers">
                <label>Loan amount<input required type="number" min="0.01" step="0.01" value={form.loanAmount} onChange={(event) => updateField('loanAmount', Number(event.target.value))} /></label>
                <label>Monthly income<input required type="number" min="0" step="0.01" value={form.income} onChange={(event) => updateField('income', Number(event.target.value))} /></label>
                <label>Employment (years)<input required type="number" min="0" step="0.1" value={form.employmentLength} onChange={(event) => updateField('employmentLength', Number(event.target.value))} /></label>
              </div>
              <div className="form-divider"><span>SHARED IDENTIFIERS</span><i /></div>
              <div className="field-row">
                <label>Device ID<input required maxLength={128} value={form.deviceId} onChange={(event) => updateField('deviceId', event.target.value)} placeholder="SYNTH-DEVICE-A" /></label>
                <label>IP address<input required type="text" inputMode="decimal" value={form.ipAddress} onChange={(event) => updateField('ipAddress', event.target.value)} placeholder="192.0.2.10" /></label>
              </div>
              <div className="field-row">
                <label>UPI identifier<input required maxLength={128} value={form.upiId} onChange={(event) => updateField('upiId', event.target.value)} placeholder="demo-user@example" /></label>
                <label>Bank account ID<input required maxLength={128} value={form.bankAccountId} onChange={(event) => updateField('bankAccountId', event.target.value)} placeholder="SYNTH-ACCOUNT-A" /></label>
              </div>
              {error && <div className="error-message" role="alert"><AlertTriangle size={16} /> {error}</div>}
              <div className="form-footer"><p><span className="privacy-mark"><Shield size={13} /></span> Use synthetic data only. Values may be persisted by the configured backend.</p><button className="submit-button" type="submit" disabled={submitting || !apiOnline}>{submitting ? <><span className="button-spinner" /> Analyzing</> : <>Create &amp; analyze <ArrowUpRight size={16} /></>}</button></div>
              {!apiOnline && <p className="api-hint">Start the backend to submit an application.</p>}
            </form>
          </section>

          <div className="right-column">
            <section className={`result-panel panel ${assessment ? `risk-${assessment.riskLevel.toLowerCase()}` : ''}`}>
              <div className="panel-heading"><div><div className="section-kicker">02 / ASSESSMENT</div><h2>Risk result</h2></div><span className="panel-icon"><Signal size={19} /></span></div>
              {assessment ? <>
                <div className="risk-score-row"><div className={`risk-score risk-score-${assessment.riskLevel.toLowerCase()}`}><span>{assessment.riskScore}</span><small>/100</small></div><div className="risk-level-wrap"><span className="summary-label">DEMO RISK BAND</span><strong className={`risk-level-text text-${assessment.riskLevel.toLowerCase()}`}>{assessment.riskLevel}</strong><span className="risk-disclaimer">Not a fraud determination</span></div><div className="score-direction">{assessment.riskScore >= 30 ? <ArrowUpRight size={19} /> : <ArrowDownRight size={19} />}</div></div>
                <div className="score-track"><span style={{ width: `${assessment.riskScore}%` }} /></div>
                <div className="signal-count"><span>{assessment.signals.length} configured signal{assessment.signals.length === 1 ? '' : 's'}</span><span>Updated {new Date(assessment.timestamp).toLocaleTimeString()}</span></div>
                <div className="signals-list">{assessment.signals.length === 0 ? <div className="empty-signals"><BadgeCheck size={17} /> No configured signals found in this session</div> : assessment.signals.map((signal) => { const detail = signalDetails[signal.type]; const Icon = detail.icon; return <div className="signal-row" key={signal.type}><span className="signal-symbol"><Icon size={15} /></span><span className="signal-name">{detail.label}<small>{signal.description}</small></span><span className="signal-weight">+{signal.weight}</span></div> })}</div>
                {assessment.explanation && <div className="explanation-panel">
                  <div className="evidence-heading">DETERMINISTIC EVIDENCE EXPLANATION</div>
                  <p className="explanation-summary">{assessment.explanation.summary}</p>
                  <div className="explanation-signal-list">
                    {assessment.explanation.signals.map((signal) => (
                      <div className="explanation-signal" key={signal.type}>
                        <strong>{signal.label}</strong>
                        <span>{signal.detail}</span>
                        {signal.relatedApplicationIds.length > 0 && <small>Linked applications: {signal.relatedApplicationIds.join(', ')}</small>}
                      </div>
                    ))}
                  </div>
                  <div className="recommendation-box">
                    <span>Recommended action</span>
                    <p>{assessment.explanation.recommendedAction}</p>
                  </div>
                </div>}
                <div className="evidence-list">
                  <div className="evidence-heading">EVIDENCE &amp; CONTEXT</div>
                  {assessment.evidence.map((item, index) => (
                    <div className="evidence-entry" key={`${item.type}-${index}`}>
                      <p><span />{item.message}</p>
                      {item.relatedApplicationIds.length > 0 && (
                        <small className="evidence-references">
                          Matched application IDs: {item.relatedApplicationIds.join(', ')}
                        </small>
                      )}
                    </div>
                  ))}
                </div>
              </> : <div className="result-empty"><div className="empty-orbit"><ScanSearch size={23} /></div><strong>Assessment appears here</strong><span>Submit a synthetic application to evaluate configured demo signals.</span><div className="empty-meta"><span>6 signal types</span><i /><span>Evidence included</span></div></div>}
              {application && assessment && <div className="result-reference">APPLICATION <span>{application.id.slice(0, 8).toUpperCase()}</span></div>}
            </section>

            <section className="network-panel panel">
              <div className="panel-heading"><div><div className="section-kicker">03 / RELATIONSHIPS</div><h2>Applicant network</h2></div><span className="panel-icon"><Network size={19} /></span></div>
              {graph ? <>
                <div className="network-origin">
                  <span className="network-node-mark origin-mark" />
                  <div><strong>{graph.application.name}</strong><small>{graph.application.applicantId} · current application</small></div>
                </div>
                {graph.connectedApplicants.length === 0 ? <div className="network-empty">No connected applicants found in the available graph data.</div> : <div className="network-branches">
                  {graph.connectedApplicants.map((connectedApplicant) => (
                    <article className="network-branch" key={connectedApplicant.applicantId}>
                      <span className="network-connector" />
                      <div className="network-person">
                        <span className="network-node-mark" />
                        <div><strong>{connectedApplicant.name}</strong><small>{connectedApplicant.applicantId} · {connectedApplicant.applicationIds.length} linked application(s)</small>
                          <div className="network-identifiers">{connectedApplicant.sharedIdentifiers.map((identifier) => <span key={`${identifier.type}-${identifier.value}`}>{identifier.type.replace('SHARED_', '').replace('_', ' ')} · {identifier.value}</span>)}</div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>}
                <div className="network-footer"><span>{graph.relationshipPaths.length} relationship path(s)</span><span>{graph.evidence.length} evidence group(s)</span></div>
              </> : <div className="network-empty">{graphError || 'Submit an application to inspect its connected applicants and shared identifiers.'}</div>}
            </section>

            <section className="events-panel panel">
              <div className="panel-heading events-heading"><div><div className="section-kicker">03 / STREAM</div><h2>Live events</h2></div><span className={`connection-indicator ${connected ? 'connected' : ''}`} title={connected ? 'Socket.IO connected' : 'Socket.IO disconnected'}><span /></span></div>
              <div className="event-list">{events.length === 0 ? <div className="events-empty"><Radio size={18} /><span>Events will appear when applications are created or assessed.</span></div> : events.map((liveEvent) => <article className="event-item" key={liveEvent.id}><span className="event-mark"><Activity size={14} /></span><div><strong>{liveEvent.title}</strong><span>{liveEvent.detail}</span></div><time>{new Date(liveEvent.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></article>)}</div>
              <div className="stream-footer"><span className={`status-dot ${connected ? 'online' : ''}`} /> {connected ? 'Connected to event stream' : 'Connecting to event stream'}</div>
            </section>
          </div>
        </div>
        <NetworkInvestigation selectedApplicationIdOverride={selectedApplicationId ?? undefined} />
        <footer className="page-footer"><span>SYBILBUSTER <i /> FOUNDATION BUILD</span><span>Assessments are demo-only and require human review.</span></footer>
      </main>
    </div>
  )
}

export default App
