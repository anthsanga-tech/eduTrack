import { useCallback, useEffect, useMemo, useState } from 'react'
import API from '../services/api'
import ReportStatCard from '../components/ReportStatCard.jsx'
import ScoreProgressionChart from '../components/ScoreProgressionChart.jsx'
import '../assets/css/Reports.css'

const pageSize = 25
const blankFilters = {
  testId: '',
  search: '',
  status: 'all',
  from: '',
  to: '',
  sortBy: 'submittedAt',
  sortOrder: 'desc',
}

const queryFilters = filters => Object.fromEntries(
  Object.entries(filters).filter(([, value]) => value !== '')
)

const displayPercent = value => value == null ? '—' : `${Number(value).toFixed(1)}%`
const displayDate = value => value ? new Date(value).toLocaleString() : '—'
const resultLabel = result => result.passed == null ? 'Unscored' : result.passed ? 'Pass' : 'Fail'

function ReportTable({ children, label }) {
  return (
    <div className="reports-table-wrap">
      <table className="reports-table">
        <caption className="visually-hidden">{label}</caption>
        {children}
      </table>
    </div>
  )
}

export default function Reports() {
  const [section, setSection] = useState('overview')
  const [overview, setOverview] = useState(null)
  const [tests, setTests] = useState([])
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState('')
  const [filters, setFilters] = useState(blankFilters)
  const [appliedFilters, setAppliedFilters] = useState(blankFilters)
  const [results, setResults] = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 0, total: 0 })
  const [resultsLoading, setResultsLoading] = useState(false)
  const [resultsError, setResultsError] = useState('')
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [performance, setPerformance] = useState(null)
  const [performancePage, setPerformancePage] = useState(1)
  const [performanceLoading, setPerformanceLoading] = useState(false)
  const [performanceError, setPerformanceError] = useState('')
  const [performanceReload, setPerformanceReload] = useState(0)
  const [submission, setSubmission] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true)
    setOverviewError('')
    try {
      const { data } = await API.get('/teacher/reports/overview')
      setOverview(data.data)
    } catch (error) {
      console.error('Failed to load reporting overview', error)
      setOverviewError(error.response?.data?.message || 'Reporting overview could not be loaded.')
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadPageData = async () => {
      setOverviewLoading(true)
      setOverviewError('')
      try {
        const [overviewResponse, testsResponse] = await Promise.all([
          API.get('/teacher/reports/overview'),
          API.get('/teacher/tests'),
        ])
        if (!active) return
        setOverview(overviewResponse.data.data)
        setTests(testsResponse.data)
      } catch (error) {
        console.error('Failed to load reporting data', error)
        if (active) setOverviewError(error.response?.data?.message || 'Reporting data could not be loaded.')
      } finally {
        if (active) setOverviewLoading(false)
      }
    }
    loadPageData()
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const loadResults = async () => {
      setResultsLoading(true)
      setResultsError('')
      try {
        const { data } = await API.get('/teacher/reports/test-results', {
          params: { ...queryFilters(appliedFilters), page: pagination.page, limit: pageSize },
        })
        if (!active) return
        setResults(data.data)
        setPagination(current => ({ ...current, ...data.pagination }))
      } catch (error) {
        console.error('Failed to load test results', error)
        if (active) setResultsError(error.response?.data?.message || 'Test results could not be loaded.')
      } finally {
        if (active) setResultsLoading(false)
      }
    }
    loadResults()
    return () => { active = false }
  }, [appliedFilters, pagination.page])

  useEffect(() => {
    if (!selectedStudent || section !== 'students') return undefined
    let active = true
    const loadPerformance = async () => {
      setPerformanceLoading(true)
      setPerformanceError('')
      try {
        const { data } = await API.get('/teacher/reports/student-performance', {
          params: { studentId: selectedStudent._id, page: performancePage, limit: 100 },
        })
        if (active) setPerformance(data)
      } catch (error) {
        console.error('Failed to load student performance', error)
        if (active) setPerformanceError(error.response?.data?.message || 'Student performance could not be loaded.')
      } finally {
        if (active) setPerformanceLoading(false)
      }
    }
    loadPerformance()
    return () => { active = false }
  }, [selectedStudent, section, performancePage, performanceReload])

  useEffect(() => {
    if (!detailLoading && !detailError && !submission) return undefined
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setSubmission(null)
        setDetailError('')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [detailLoading, detailError, submission])

  const stats = overview?.stats
  const distribution = overview?.passFailDistribution || { passed: 0, failed: 0, unscored: 0 }
  const distributionTotal = distribution.passed + distribution.failed + distribution.unscored
  const ownedTests = useMemo(() => tests.slice().sort((a, b) => a.title.localeCompare(b.title)), [tests])

  const applyFilters = event => {
    event.preventDefault()
    setPagination(current => ({ ...current, page: 1 }))
    setAppliedFilters({ ...filters })
  }

  const viewStudent = result => {
    setSelectedStudent(result.student)
    setPerformancePage(1)
    setSection('students')
  }

  const viewSubmission = async submissionId => {
    setSubmission(null)
    setDetailError('')
    setDetailLoading(true)
    try {
      const { data } = await API.get(`/teacher/reports/submissions/${submissionId}`)
      setSubmission(data.data)
    } catch (error) {
      console.error('Failed to load submission details', error)
      setDetailError(error.response?.data?.message || 'Submission details could not be loaded.')
    } finally {
      setDetailLoading(false)
    }
  }

  const exportResults = async () => {
    setExporting(true)
    setExportError('')
    try {
      const { data } = await API.get('/teacher/reports/export', {
        params: queryFilters(appliedFilters),
        responseType: 'blob',
      })
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = 'teacher-test-results.csv'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export test results', error)
      setExportError(error.response?.data?.message || 'CSV export could not be created.')
    } finally {
      setExporting(false)
    }
  }

  const closeDetails = () => {
    setSubmission(null)
    setDetailError('')
  }

  return (
    <main className="main teacher-reports">
      <header className="reports-heading">
        <div>
          <p className="reports-eyebrow">Teaching workspace</p>
          <h1>Results &amp; Reports</h1>
          <p>Review completed attempts and follow student performance across your assessments.</p>
        </div>
        {section === 'overview' && (
          <button className="button" type="button" onClick={loadOverview} disabled={overviewLoading}>
            {overviewLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </header>

      <div className="reports-tabs" role="tablist" aria-label="Reporting sections">
        {[
          ['overview', 'Overview'],
          ['results', 'Test results'],
          ['students', 'Student performance'],
        ].map(([value, label]) => (
          <button
            key={value}
            id={`reports-tab-${value}`}
            type="button"
            role="tab"
            aria-selected={section === value}
            className={section === value ? 'is-active' : ''}
            onClick={() => setSection(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'overview' && (
        <section id="reports-panel-overview" role="tabpanel" aria-labelledby="reports-tab-overview" className="reports-panel">
          {overviewError ? (
            <div className="reports-state reports-state-error" role="alert">
              <p>{overviewError}</p>
              <button className="button" type="button" onClick={loadOverview}>Try again</button>
            </div>
          ) : (
            <>
              <div className="report-stat-grid" aria-live="polite" aria-busy={overviewLoading}>
                <ReportStatCard label="Unique students" value={overviewLoading ? '—' : stats?.uniqueStudents ?? 0} note="Across completed submissions" />
                <ReportStatCard label="Total attempts" value={overviewLoading ? '—' : stats?.totalAttempts ?? 0} note="Completed submissions only" />
                <ReportStatCard label="Average score" value={overviewLoading ? '—' : displayPercent(stats?.averageScore)} note="Average percentage per scored attempt" />
                <ReportStatCard label="Pass rate" value={overviewLoading ? '—' : displayPercent(stats?.passRate)} note={`${stats?.passed ?? 0} passed of ${stats?.scoredAttempts ?? 0} scored attempts`} />
                <ReportStatCard label="Passed" value={overviewLoading ? '—' : stats?.passed ?? 0} />
                <ReportStatCard label="Failed" value={overviewLoading ? '—' : stats?.failed ?? 0} />
              </div>

              {!overviewLoading && distributionTotal === 0 ? (
                <div className="reports-state">
                  <h2>No completed results yet</h2>
                  <p>When students submit your tests, summary statistics and recent results will appear here.</p>
                </div>
              ) : (
                <div className="reports-overview-grid">
                  <section className="reports-card" aria-labelledby="distribution-title">
                    <div className="reports-card-heading">
                      <div><h2 id="distribution-title">Pass/fail distribution</h2><p>Completed attempts with unavailable scores are shown separately.</p></div>
                    </div>
                    <div className="distribution-bars" aria-label={`${distribution.passed} passed, ${distribution.failed} failed, ${distribution.unscored} unscored`}>
                      {[
                        ['Passed', distribution.passed, 'passed'],
                        ['Failed', distribution.failed, 'failed'],
                        ['Unscored', distribution.unscored, 'unscored'],
                      ].map(([label, count, kind]) => (
                        <div className="distribution-row" key={kind}>
                          <span>{label}</span>
                          <span className="distribution-track" aria-hidden="true">
                            <span className={`distribution-fill ${kind}`} style={{ width: `${distributionTotal ? count / distributionTotal * 100 : 0}%` }} />
                          </span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="reports-card" aria-labelledby="top-tests-title">
                    <div className="reports-card-heading">
                      <div><h2 id="top-tests-title">Test performance</h2><p>Average percentage across completed, scored attempts.</p></div>
                    </div>
                    {(overview?.averageScoresByTest || []).length === 0 ? (
                      <p className="reports-empty-inline">No scored test results yet.</p>
                    ) : (
                      <div className="test-score-list">
                        {overview.averageScoresByTest.map(item => (
                          <div className="test-score-row" key={item._id}>
                            <span title={item.testName}>{item.testName}</span>
                            <span className="test-score-track" aria-hidden="true">
                              <span style={{ width: `${Math.min(100, item.averageScore || 0)}%` }} />
                            </span>
                            <strong>{displayPercent(item.averageScore)}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="reports-top-tests">
                      Highest: <strong>{overview?.highestPerformingTest?.testName || '—'}</strong>
                      <span aria-hidden="true"> · </span>
                      Lowest: <strong>{overview?.lowestPerformingTest?.testName || '—'}</strong>
                    </p>
                  </section>

                  <section className="reports-card reports-recent-card" aria-labelledby="recent-submissions-title">
                    <div className="reports-card-heading">
                      <div><h2 id="recent-submissions-title">Recent submissions</h2><p>Latest completed attempts across your tests.</p></div>
                      <button className="reports-text-button" type="button" onClick={() => setSection('results')}>View all results</button>
                    </div>
                    {(overview?.recentSubmissions || []).length === 0 ? (
                      <p className="reports-empty-inline">No recent submissions.</p>
                    ) : (
                      <ReportTable label="Recent student submissions">
                        <thead><tr><th>Student</th><th>Test</th><th>Attempt</th><th>Score</th><th>Result</th><th>Submitted</th><th>Details</th></tr></thead>
                        <tbody>
                          {overview.recentSubmissions.map(result => (
                            <tr key={result._id}>
                              <td>{result.student?.name || result.student?.email || 'Student'}</td>
                              <td>{result.testName}</td>
                              <td>{result.attemptNumber}</td>
                              <td>{result.percentage == null ? '—' : `${result.score} / ${result.maximumScore} (${displayPercent(result.percentage)})`}</td>
                              <td><span className={`result-badge ${result.passed === true ? 'is-pass' : result.passed === false ? 'is-fail' : 'is-unscored'}`}>{resultLabel(result)}</span></td>
                              <td>{displayDate(result.submittedAt)}</td>
                              <td><button className="reports-text-button" type="button" onClick={() => viewSubmission(result._id)}>View</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </ReportTable>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {section === 'results' && (
        <section id="reports-panel-results" role="tabpanel" aria-labelledby="reports-tab-results" className="reports-panel">
          <form className="reports-filter-card" onSubmit={applyFilters}>
            <label>Test
              <select value={filters.testId} onChange={event => setFilters({ ...filters, testId: event.target.value })}>
                <option value="">All my tests</option>
                {ownedTests.map(test => <option key={test._id} value={test._id}>{test.title}</option>)}
              </select>
            </label>
            <label>Search student
              <input value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} placeholder="Name or email" />
            </label>
            <label>Result
              <select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}>
                <option value="all">All results</option><option value="pass">Passed</option><option value="fail">Failed</option>
              </select>
            </label>
            <label>From
              <input type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} />
            </label>
            <label>To
              <input type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} />
            </label>
            <label>Sort by
              <select value={filters.sortBy} onChange={event => setFilters({ ...filters, sortBy: event.target.value })}>
                <option value="submittedAt">Submission date</option><option value="score">Score percentage</option>
              </select>
            </label>
            <label>Order
              <select value={filters.sortOrder} onChange={event => setFilters({ ...filters, sortOrder: event.target.value })}>
                <option value="desc">Descending</option><option value="asc">Ascending</option>
              </select>
            </label>
            <div className="reports-filter-actions">
              <button className="button" type="submit">Apply filters</button>
              <button className="reports-secondary-button" type="button" onClick={() => { setFilters(blankFilters); setPagination(current => ({ ...current, page: 1 })); setAppliedFilters(blankFilters) }}>Reset</button>
            </div>
          </form>

          <div className="reports-card">
            <div className="reports-card-heading">
              <div><h2>Completed test results</h2><p>{pagination.total} completed attempts match the selected filters. Retakes are listed separately.</p></div>
              <button className="button" type="button" onClick={exportResults} disabled={exporting}>
                {exporting ? 'Preparing CSV…' : 'Export CSV'}
              </button>
            </div>
            {exportError && <p className="reports-inline-error" role="alert">{exportError}</p>}
            {resultsError ? (
              <div className="reports-state reports-state-error" role="alert"><p>{resultsError}</p><button className="button" type="button" onClick={() => setAppliedFilters({ ...appliedFilters })}>Try again</button></div>
            ) : resultsLoading ? (
              <div className="reports-state" role="status">Loading test results…</div>
            ) : results.length === 0 ? (
              <div className="reports-state"><h3>No matching results</h3><p>Try changing the filters or wait for a student to complete a test.</p></div>
            ) : (
              <>
                <ReportTable label="Paginated test results">
                  <thead><tr><th>Student</th><th>Identifier</th><th>Test</th><th>Score</th><th>Percentage</th><th>Status</th><th>Attempt</th><th>Submitted</th><th>Time taken</th><th>Actions</th></tr></thead>
                  <tbody>
                    {results.map(result => (
                      <tr key={result._id}>
                        <td>{result.student?.name || '—'}</td>
                        <td>{result.student?.email || '—'}</td>
                        <td>{result.testName}</td>
                        <td>{result.maximumScore == null ? '—' : `${result.score} / ${result.maximumScore}`}</td>
                        <td>{displayPercent(result.percentage)}</td>
                        <td><span className={`result-badge ${result.passed === true ? 'is-pass' : result.passed === false ? 'is-fail' : 'is-unscored'}`}>{resultLabel(result)}</span></td>
                        <td>{result.attemptNumber}</td>
                        <td>{displayDate(result.submittedAt)}</td>
                        <td>{result.timeTakenInSeconds == null ? '—' : `${Math.floor(result.timeTakenInSeconds / 60)}m ${result.timeTakenInSeconds % 60}s`}</td>
                        <td className="reports-row-actions">
                          <button className="reports-text-button" type="button" onClick={() => viewSubmission(result._id)}>Details</button>
                          <button className="reports-text-button" type="button" onClick={() => viewStudent(result)}>Student</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </ReportTable>
                <div className="reports-pagination" aria-label="Results pagination">
                  <span>Page {pagination.page} of {pagination.totalPages || 1}</span>
                  <div>
                    <button className="reports-secondary-button" type="button" disabled={pagination.page <= 1} onClick={() => setPagination(current => ({ ...current, page: current.page - 1 }))}>Previous</button>
                    <button className="reports-secondary-button" type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(current => ({ ...current, page: current.page + 1 }))}>Next</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {section === 'students' && (
        <section id="reports-panel-students" role="tabpanel" aria-labelledby="reports-tab-students" className="reports-panel">
          {!selectedStudent ? (
            <div className="reports-state">
              <h2>Select a student</h2>
              <p>Open a student’s performance from a completed result in the Test results tab.</p>
              <button className="button" type="button" onClick={() => setSection('results')}>Go to test results</button>
            </div>
          ) : performanceError ? (
            <div className="reports-state reports-state-error" role="alert"><p>{performanceError}</p><button className="button" type="button" onClick={() => setPerformanceReload(current => current + 1)}>Try again</button></div>
          ) : performanceLoading || !performance ? (
            <div className="reports-state" role="status">Loading {selectedStudent.name}’s performance…</div>
          ) : (
            <>
              <div className="reports-student-heading">
                <div><p className="reports-eyebrow">Individual performance</p><h2>{performance.data.student.name}</h2><p>{performance.data.student.email}</p></div>
                <button className="reports-secondary-button" type="button" onClick={() => { setSelectedStudent(null); setPerformance(null) }}>Choose another student</button>
              </div>
              <div className="report-stat-grid">
                <ReportStatCard label="Unique tests" value={performance.data.summary.totalTests} />
                <ReportStatCard label="Total attempts" value={performance.data.summary.totalAttempts} note="Each retake is shown separately" />
                <ReportStatCard label="Average score" value={displayPercent(performance.data.summary.averageScore)} />
                <ReportStatCard label="Best score" value={displayPercent(performance.data.summary.bestScore)} />
                <ReportStatCard label="Latest score" value={displayPercent(performance.data.summary.latestScore)} />
                <ReportStatCard label="Pass rate" value={displayPercent(performance.data.summary.passRate)} note={`${performance.data.summary.failedTests} tests include a failed attempt`} />
                <ReportStatCard label="Failed tests" value={performance.data.summary.failedTests} note="Tests with at least one failed attempt" />
              </div>

              <section className="reports-card" aria-labelledby="progression-title">
                <div className="reports-card-heading"><div><h2 id="progression-title">Score progression</h2><p>Completed attempts are shown oldest to newest. A retake is a separate point.</p></div></div>
                <ScoreProgressionChart history={performance.data.history} />
                {performance.pagination.totalPages > 1 && (
                  <div className="reports-pagination">
                    <span>Showing attempt history page {performance.pagination.page} of {performance.pagination.totalPages}</span>
                    <div>
                      <button className="reports-secondary-button" type="button" disabled={performancePage <= 1} onClick={() => setPerformancePage(page => page - 1)}>Earlier</button>
                      <button className="reports-secondary-button" type="button" disabled={performancePage >= performance.pagination.totalPages} onClick={() => setPerformancePage(page => page + 1)}>Later</button>
                    </div>
                  </div>
                )}
              </section>

              <section className="reports-card" aria-labelledby="student-tests-title">
                <div className="reports-card-heading"><div><h2 id="student-tests-title">Performance by test</h2><p>Average, best, and latest percentages summarize individual attempts.</p></div></div>
                <ReportTable label="Student performance by test">
                  <thead><tr><th>Test</th><th>Attempts</th><th>Average</th><th>Best</th><th>Latest</th><th>Pass rate</th><th>Passed / failed</th></tr></thead>
                  <tbody>{performance.data.testPerformance.map(item => (
                    <tr key={item._id}><td>{item.testName}</td><td>{item.attempts}</td><td>{displayPercent(item.averageScore)}</td><td>{displayPercent(item.bestScore)}</td><td>{displayPercent(item.latestScore)}</td><td>{displayPercent(item.passRate)}</td><td>{item.passed} / {item.failed}</td></tr>
                  ))}</tbody>
                </ReportTable>
              </section>

              <section className="reports-card" aria-labelledby="student-history-title">
                <div className="reports-card-heading"><div><h2 id="student-history-title">Completed attempt history</h2><p>Attempt numbers are per student and test; in-progress attempts are excluded.</p></div></div>
                <ReportTable label="Student completed attempt history">
                  <thead><tr><th>Test</th><th>Attempt</th><th>Score</th><th>Percentage</th><th>Result</th><th>Submitted</th><th>Details</th></tr></thead>
                  <tbody>{performance.data.history.map(result => (
                    <tr key={result._id}><td>{result.testName}</td><td>{result.attemptNumber}</td><td>{result.maximumScore == null ? '—' : `${result.score} / ${result.maximumScore}`}</td><td>{displayPercent(result.percentage)}</td><td><span className={`result-badge ${result.passed === true ? 'is-pass' : result.passed === false ? 'is-fail' : 'is-unscored'}`}>{resultLabel(result)}</span></td><td>{displayDate(result.submittedAt)}</td><td><button className="reports-text-button" type="button" onClick={() => viewSubmission(result._id)}>View</button></td></tr>
                  ))}</tbody>
                </ReportTable>
              </section>
            </>
          )}
        </section>
      )}

      {(detailLoading || detailError || submission) && (
        <div className="reports-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeDetails() }}>
          <section className="reports-modal" role="dialog" aria-modal="true" aria-labelledby="submission-dialog-title">
            <div className="reports-modal-heading">
              <div><p className="reports-eyebrow">Submission detail</p><h2 id="submission-dialog-title">{submission?.test?.title || 'Submission'}</h2></div>
              <button className="reports-modal-close" type="button" aria-label="Close submission details" onClick={closeDetails}>×</button>
            </div>
            {detailLoading ? <p role="status">Loading submission details…</p> : detailError ? <p className="reports-inline-error" role="alert">{detailError}</p> : submission && (
              <>
                <dl className="submission-detail-grid">
                  <div><dt>Student</dt><dd>{submission.student.name} ({submission.student.email})</dd></div>
                  <div><dt>Attempt</dt><dd>{submission.attemptNumber}</dd></div>
                  <div><dt>Submitted</dt><dd>{displayDate(submission.submittedAt)}</dd></div>
                  <div><dt>Score</dt><dd>{submission.maximumScore == null ? `${submission.score} / —` : `${submission.score} / ${submission.maximumScore} (${displayPercent(submission.percentage)})`}</dd></div>
                  <div><dt>Result</dt><dd>{submission.passed == null ? 'Unscored' : submission.passed ? 'Passed' : 'Failed'}</dd></div>
                  <div><dt>Time taken</dt><dd>{submission.timeTakenInSeconds == null ? '—' : `${Math.floor(submission.timeTakenInSeconds / 60)}m ${submission.timeTakenInSeconds % 60}s`}</dd></div>
                </dl>
                <div className="submission-questions">
                  <h3>Question review</h3>
                  {submission.questions.length === 0 ? <p className="reports-empty-inline">Historical question snapshots are unavailable for this submission.</p> : submission.questions.map((question, index) => (
                    <article className={`submission-question ${question.status}`} key={question.questionId}>
                      <p className="submission-question-meta">Question {index + 1} · {question.status}</p>
                      <h4>{question.questionText}</h4>
                      <p>Your answer: <strong>{question.submittedAnswer ? `${question.submittedAnswer.toUpperCase()}. ${question.options?.[question.submittedAnswer] || ''}` : 'Unanswered'}</strong></p>
                      <p>Correct answer: <strong>{question.correctAnswer ? `${question.correctAnswer.toUpperCase()}. ${question.options?.[question.correctAnswer] || ''}` : 'Unavailable'}</strong></p>
                      <p>Marks awarded: <strong>{question.marksAwarded} / {question.maximumMarks}</strong></p>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
