import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Layers3, ShieldAlert, Signal, TrendingUp, WalletCards } from 'lucide-react'
import { analyzeRisk, getApplicationGraph, listApplications } from './api'
import type { GraphNetworkResponse, LoanApplication, RiskAssessment } from './types'
import './advanced-dashboard.css'

type RiskFilter = 'ALL' | 'LOW' | 'MEDIUM' | 'HIGH'
type StatusFilter = 'ALL' | 'MONITORING' | 'REVIEW' | 'ELEVATED'

type DashboardRow = {
  application: LoanApplication
  assessment: RiskAssessment | null
  graph: GraphNetworkResponse | null
}

interface AdvancedDashboardProps {
  applications: LoanApplication[]
  selectedApplicationId?: string
  onSelectApplication: (applicationId: string) => void
}

export function AdvancedDashboard({ applications, selectedApplicationId, onSelectApplication }: AdvancedDashboardProps) {
  const [rows, setRows] = useState<DashboardRow[]>([])
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    void listApplications().then(async (list) => {
      if (!active) return
      const hydrated = await Promise.all(list.map(async (application) => {
        try {
          const [assessment, graph] = await Promise.all([
            analyzeRisk(application.id),
            getApplicationGraph(application.id),
          ])
          return { application, assessment, graph }
        } catch {
          return { application, assessment: null, graph: null }
        }
      }))

      if (active) setRows(hydrated)
    }).catch((requestError) => {
      if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load dashboard analytics.')
    }).finally(() => {
      if (active) setLoading(false)
    })

    return () => { active = false }
  }, [applications.length])

  const metrics = useMemo(() => {
    const counts = { LOW: 0, MEDIUM: 0, HIGH: 0 }
    let suspicious = 0
    let sharedSignals = 0
    let suspiciousRings = 0

    for (const row of rows) {
      const level = row.assessment?.riskLevel ?? 'LOW'
      counts[level] += 1
      if ((row.assessment?.riskScore ?? 0) > 0) suspicious += 1
      sharedSignals += row.assessment?.signals.length ?? 0
      if ((row.graph?.connectedApplicants.length ?? 0) > 0 || (row.graph?.relationshipPaths.length ?? 0) > 0) {
        suspiciousRings += 1
      }
    }

    return {
      totalApplications: rows.length || applications.length,
      counts,
      suspicious,
      sharedSignals,
      suspiciousRings,
    }
  }, [applications.length, rows])

  const signalFrequency = useMemo(() => {
    const totals = {
      SHARED_DEVICE: 0,
      SHARED_UPI: 0,
      SHARED_BANK: 0,
      SHARED_IP: 0,
      DEFAULT_HISTORY: 0,
      NETWORK_CONNECTION: 0,
    }

    for (const row of rows) {
      for (const signal of row.assessment?.signals ?? []) {
        totals[signal.type] += 1
      }
    }

    return Object.entries(totals)
      .map(([type, count]) => ({ type, label: type.replaceAll('_', ' '), count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6)
  }, [rows])

  const recentActivity = useMemo(() => {
    const items = rows.map((row) => ({
      id: row.application.id,
      title: `${row.application.applicantId} · ${row.application.name}`,
      detail: row.assessment ? `${row.assessment.riskLevel} risk · ${row.assessment.signals.length} signal(s)` : 'Assessment unavailable',
      timestamp: row.assessment?.timestamp ?? row.application.createdAt,
      riskLevel: row.assessment?.riskLevel ?? 'LOW',
    }))

    return [...items].sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()).slice(0, 5)
  }, [rows])

  const filteredRows = useMemo(() => rows.filter((row) => {
    const riskLevel = row.assessment?.riskLevel ?? 'LOW'
    const matchesRisk = riskFilter === 'ALL' || riskLevel === riskFilter
    const status = riskLevel === 'HIGH' ? 'ELEVATED' : riskLevel === 'MEDIUM' ? 'REVIEW' : 'MONITORING'
    const matchesStatus = statusFilter === 'ALL' || status === statusFilter
    return matchesRisk && matchesStatus
  }), [riskFilter, rows, statusFilter])

  const riskDistribution = [metrics.counts.LOW, metrics.counts.MEDIUM, metrics.counts.HIGH]
  const maxRiskCount = Math.max(...riskDistribution, 1)

  return (
    <section className="advanced-dashboard" aria-label="SybilBuster command center dashboard">
      <div className="advanced-dashboard-header">
        <div>
          <span>COMMAND CENTER / ANALYTICS</span>
          <h2>SybilBuster dashboard</h2>
        </div>
        <div className="demo-badge"><i /> Synthetic demo data</div>
      </div>

      {error && <div className="investigation-error"><ShieldAlert size={16} /> {error}</div>}

      <div className="advanced-metrics">
        <div className="metric-card">
          <div className="metric-label"><span>Total applications</span><div className="mini-icon"><Layers3 size={14} /></div></div>
          <div className="metric-value"><strong>{metrics.totalApplications}</strong><small>jobs</small></div>
          <div className="metric-subtext">Current in-memory dataset</div>
        </div>
        <div className="metric-card">
          <div className="metric-label"><span>Low risk</span><div className="mini-icon"><TrendingUp size={14} /></div></div>
          <div className="metric-value"><strong>{metrics.counts.LOW}</strong><small>apps</small></div>
          <div className="metric-subtext">Routine monitoring</div>
        </div>
        <div className="metric-card">
          <div className="metric-label"><span>Medium risk</span><div className="mini-icon"><Signal size={14} /></div></div>
          <div className="metric-value"><strong>{metrics.counts.MEDIUM}</strong><small>apps</small></div>
          <div className="metric-subtext">Manual review</div>
        </div>
        <div className="metric-card">
          <div className="metric-label"><span>High risk</span><div className="mini-icon"><ShieldAlert size={14} /></div></div>
          <div className="metric-value"><strong>{metrics.counts.HIGH}</strong><small>apps</small></div>
          <div className="metric-subtext">Priority escalation</div>
        </div>
        <div className="metric-card">
          <div className="metric-label"><span>Suspicious</span><div className="mini-icon"><WalletCards size={14} /></div></div>
          <div className="metric-value"><strong>{metrics.suspicious}</strong><small>apps</small></div>
          <div className="metric-subtext">Signal-bearing applications</div>
        </div>
      </div>

      <div className="advanced-split">
        <div className="visual-card">
          <div className="chart-header"><h3>Risk distribution</h3><span>{metrics.totalApplications} applications</span></div>
          <div className="risk-chart">
            {(['LOW', 'MEDIUM', 'HIGH'] as const).map((level) => (
              <div key={level} className="risk-column">
                <div className={`risk-bar ${level.toLowerCase()}`}><span style={{ height: `${Math.max((metrics.counts[level] / maxRiskCount) * 100, 14)}%` }} /></div>
                <strong>{metrics.counts[level]}</strong>
                <small>{level}</small>
              </div>
            ))}
          </div>

          <div className="chart-header" style={{ marginTop: '18px' }}><h3>Signal frequency</h3><span>{metrics.sharedSignals} total signals</span></div>
          <div className="signal-chart">
            {signalFrequency.map((signal) => (
              <div className="signal-bar-row" key={signal.type}>
                <span>{signal.label}</span>
                <div className="signal-track"><i style={{ width: `${signal.count === 0 ? 0 : (signal.count / Math.max(...signalFrequency.map((value) => value.count), 1)) * 100}%` }} /></div>
                <strong>{signal.count}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="timeline-card">
          <div className="chart-header"><h3>Recent activity</h3><span>Live feed</span></div>
          <div className="timeline-list">
            {recentActivity.length === 0 ? <div className="empty-state">No application activity in the current workspace.</div> : recentActivity.map((item) => (
              <div key={item.id} className="timeline-item">
                <span className="timeline-dot" />
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
                <time>{new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}</time>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="advanced-split" style={{ marginTop: 16 }}>
        <div className="list-card">
          <div className="chart-header"><h3>Application queue</h3><span>{filteredRows.length} visible</span></div>
          <div className="list-controls">
            <button type="button" className={`filter-pill ${riskFilter === 'ALL' ? 'active' : ''}`} onClick={() => setRiskFilter('ALL')}>All risk</button>
            <button type="button" className={`filter-pill ${riskFilter === 'LOW' ? 'active' : ''}`} onClick={() => setRiskFilter('LOW')}>Low</button>
            <button type="button" className={`filter-pill ${riskFilter === 'MEDIUM' ? 'active' : ''}`} onClick={() => setRiskFilter('MEDIUM')}>Medium</button>
            <button type="button" className={`filter-pill ${riskFilter === 'HIGH' ? 'active' : ''}`} onClick={() => setRiskFilter('HIGH')}>High</button>
            <button type="button" className={`filter-pill ${statusFilter === 'ALL' ? 'active' : ''}`} onClick={() => setStatusFilter('ALL')}>All status</button>
            <button type="button" className={`filter-pill ${statusFilter === 'MONITORING' ? 'active' : ''}`} onClick={() => setStatusFilter('MONITORING')}>Monitoring</button>
            <button type="button" className={`filter-pill ${statusFilter === 'REVIEW' ? 'active' : ''}`} onClick={() => setStatusFilter('REVIEW')}>Review</button>
            <button type="button" className={`filter-pill ${statusFilter === 'ELEVATED' ? 'active' : ''}`} onClick={() => setStatusFilter('ELEVATED')}>Elevated</button>
          </div>

          <div className="app-table">
            {loading ? <div className="empty-state">Loading application analytics…</div> : filteredRows.length === 0 ? <div className="empty-state">No applications match the current filters.</div> : filteredRows.map((row) => {
              const riskLevel = row.assessment?.riskLevel ?? 'LOW'
              const status = riskLevel === 'HIGH' ? 'ELEVATED' : riskLevel === 'MEDIUM' ? 'REVIEW' : 'MONITORING'
              return (
                <button key={row.application.id} type="button" className={`app-row ${selectedApplicationId === row.application.id ? 'selected' : ''}`} onClick={() => onSelectApplication(row.application.id)}>
                  <div className="app-main">
                    <strong>{row.application.applicantId}</strong>
                    <small>{row.application.name}</small>
                  </div>
                  <div className={`risk-pill ${riskLevel.toLowerCase()}`}>{riskLevel}</div>
                  <div className="status-pill">{status}</div>
                  <div className="status-pill">{row.graph?.connectedApplicants.length ?? 0} ring</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="list-card">
          <div className="chart-header"><h3>Network coverage</h3><span>{metrics.suspiciousRings} suspicious rings</span></div>
          <div className="signal-chart">
            <div className="signal-bar-row"><span>Connected rings</span><div className="signal-track"><i style={{ width: `${Math.min((metrics.suspiciousRings / Math.max(metrics.totalApplications, 1)) * 100, 100)}%` }} /></div><strong>{metrics.suspiciousRings}</strong></div>
            <div className="signal-bar-row"><span>Shared signals</span><div className="signal-track"><i style={{ width: `${Math.min((metrics.sharedSignals / Math.max(metrics.totalApplications * 4, 1)) * 100, 100)}%` }} /></div><strong>{metrics.sharedSignals}</strong></div>
            <div className="signal-bar-row"><span>Suspicious apps</span><div className="signal-track"><i style={{ width: `${Math.min((metrics.suspicious / Math.max(metrics.totalApplications, 1)) * 100, 100)}%` }} /></div><strong>{metrics.suspicious}</strong></div>
          </div>

          <div className="chart-header" style={{ marginTop: '18px' }}><h3>Investigation flow</h3><span>Next action</span></div>
          <div className="timeline-list">
            <div className="timeline-item">
              <span className="timeline-dot" />
              <div>
                <strong>Review risk queue</strong>
                <span>Prioritize medium and high findings from the current synthetic dataset.</span>
              </div>
              <ArrowRight size={12} />
            </div>
            <div className="timeline-item">
              <span className="timeline-dot" />
              <div>
                <strong>Inspect shared identifiers</strong>
                <span>Use the network graph and evidence summary for each flagged application.</span>
              </div>
              <ArrowRight size={12} />
            </div>
            <div className="timeline-item">
              <span className="timeline-dot" />
              <div>
                <strong>Close the loop</strong>
                <span>Document the explanation and confirm the final case recommendation.</span>
              </div>
              <ArrowRight size={12} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
