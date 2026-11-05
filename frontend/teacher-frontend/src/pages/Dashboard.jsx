import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import API from '../services/api'
import '../assets/css/Dashboard.css'

const emptyAnalytics = {
  stats: {
    totalTests: 0,
    publishedTests: 0,
    assignedStudents: 0,
    submittedAttempts: 0,
    averageScore: null,
    completionRate: 0,
  },
  recentTests: [],
}

const formatPercent = value => value == null ? '—' : `${Math.round(value)}%`

export default function Dashboard() {
  const [analytics, setAnalytics] = useState(emptyAnalytics)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const { data } = await API.get('/teacher/analytics')
      setAnalytics(data)
    } catch (loadError) {
      console.error('Failed to load teacher analytics', loadError)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  const stats = analytics.stats
  const cards = [
    { label: 'Total tests', value: stats.totalTests, note: 'Created assessments' },
    { label: 'Published', value: stats.publishedTests, note: 'Currently published' },
    { label: 'Assigned students', value: stats.assignedStudents, note: 'Across all your tests' },
    { label: 'Submitted attempts', value: stats.submittedAttempts, note: 'Completed submissions' },
    { label: 'Average score', value: formatPercent(stats.averageScore), note: 'Across submitted attempts' },
    { label: 'Completion rate', value: formatPercent(stats.completionRate), note: 'Assigned students who submitted' },
  ]

  return (
    <main className="main teacher-dashboard">
      <section className="welcome-panel dashboard-welcome">
        <p className="dashboard-eyebrow">Teaching workspace</p>
        <h1>Your teaching at a glance.</h1>
        <p>Track assessment activity and student performance across your tests.</p>
      </section>

      <section aria-labelledby="analytics-heading">
        <div className="dashboard-section-heading">
          <div>
            <h2 id="analytics-heading">Assessment overview</h2>
            <p>Summary of your tests and student submissions.</p>
          </div>
          <button className="button dashboard-refresh" type="button" onClick={loadAnalytics} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error ? (
          <div className="dashboard-error" role="alert">
            <div>
              <h3>Analytics could not be loaded</h3>
              <p>Check your connection and try again.</p>
            </div>
            <button className="button" type="button" onClick={loadAnalytics}>Try again</button>
          </div>
        ) : (
          <div className="dashboard-stat-grid" aria-live="polite" aria-busy={loading}>
            {cards.map(card => (
              <article className={`dashboard-stat-card${loading ? ' is-loading' : ''}`} key={card.label}>
                <p>{card.label}</p>
                <strong>{loading ? '—' : card.value}</strong>
                <span>{card.note}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      {!error && (
        <section className="dashboard-activity" aria-label="Recent test activity">
          <div className="dashboard-section-heading">
            <div>
              <h2>Recent test performance</h2>
              <p>Average scores and submissions for your latest assessments.</p>
            </div>
            <Link className="dashboard-text-link" to="/tests">View all tests <span aria-hidden="true">→</span></Link>
          </div>

          {loading ? (
            <div className="dashboard-empty-state" role="status">Loading test performance…</div>
          ) : analytics.recentTests.length === 0 ? (
            <div className="dashboard-empty-state">
              <h3>No test activity yet</h3>
              <p>Create your first assessment to start tracking student progress.</p>
              <Link className="button no-underline" to="/tests/create">Create a test</Link>
            </div>
          ) : (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th scope="col">Test</th>
                    <th scope="col">Status</th>
                    <th scope="col">Students</th>
                    <th scope="col">Submissions</th>
                    <th scope="col">Average score</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.recentTests.map(test => {
                    const score = test.averageScore == null ? null : Math.max(0, Math.min(100, test.averageScore))
                    return (
                      <tr key={test._id}>
                        <th scope="row">
                          <span className="dashboard-test-title">{test.title}</span>
                          <span className="dashboard-test-date">
                            Created {test.createdAt ? new Date(test.createdAt).toLocaleDateString() : '—'}
                          </span>
                        </th>
                        <td><span className={`dashboard-status dashboard-status-${test.status}`}>{test.status}</span></td>
                        <td>{test.submittedStudents} / {test.assignedStudents}</td>
                        <td>{test.submissions}</td>
                        <td>
                          <div className="dashboard-score">
                            <span>{formatPercent(test.averageScore)}</span>
                            <span className="dashboard-score-track" aria-hidden="true">
                              <span style={{ width: `${score ?? 0}%` }} />
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="dashboard-shortcuts" aria-label="Teaching shortcuts">
        <div className="dashboard-section-heading">
          <div>
            <h2>Quick actions</h2>
            <p>Continue building your assessment materials.</p>
          </div>
        </div>
        <div className="quick-link-grid">
          <Link className="quick-link-card" to="/tests/create">
            <div>
              <strong>Create a test</strong>
              <span>Set up an assessment and choose its questions.</span>
            </div>
            <span className="quick-link-arrow" aria-hidden="true">→</span>
          </Link>
          <Link className="quick-link-card" to="/questions">
            <div>
              <strong>Question bank</strong>
              <span>Browse and maintain your saved questions.</span>
            </div>
            <span className="quick-link-arrow" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  )
}
