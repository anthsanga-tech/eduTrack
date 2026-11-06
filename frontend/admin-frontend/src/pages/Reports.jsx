import { useEffect, useMemo, useState } from 'react'
import API from '../services/api'

const reportOptions = [
  ['test-activity', 'Test activity'],
  ['student-outcomes', 'Student outcomes'],
  ['platform-usage', 'Platform usage'],
]

function formatHeader(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase())
}

function exportCsv(rows, reportType) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const escapeCell = value => {
    const text = String(value ?? '')
    const safeText = /^[\u0000-\u0020]*[=+\-@]/.test(text) ? `'${text}` : text
    return `"${safeText.replace(/"/g, '""')}"`
  }
  const csv = [
    headers.map(escapeCell).join(','),
    ...rows.map(row => headers.map(header => escapeCell(row[header])).join(',')),
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `edutrack-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function Reports() {
  const [reportType, setReportType] = useState('test-activity')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [subject, setSubject] = useState('all')
  const [teacher, setTeacher] = useState('all')
  const [status, setStatus] = useState('all')
  const [subjects, setSubjects] = useState([])
  const [teachers, setTeachers] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [directoryError, setDirectoryError] = useState('')
  const [reportError, setReportError] = useState('')
  const [hasRun, setHasRun] = useState(false)

  useEffect(() => {
    Promise.all([API.get('/admin/subjects'), API.get('/admin/users')])
      .then(([subjectsResponse, usersResponse]) => {
        setSubjects(subjectsResponse.data)
        setTeachers(usersResponse.data.filter(user => user.role === 'teacher'))
      })
      .catch(requestError => {
        console.error('Failed to load report filter options', requestError)
        setDirectoryError('Some filter options could not be loaded. Refresh the page to try again.')
      })
  }, [])

  const columns = useMemo(() => rows.length ? Object.keys(rows[0]) : [], [rows])

  const runReport = async event => {
    event.preventDefault()
    setReportError('')
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setReportError('Start date must be on or before end date.')
      return
    }
    setLoading(true)
    try {
      const params = {
        type: reportType,
        dateFrom,
        dateTo,
        subject,
        teacher,
        status,
      }
      const response = await API.get('/admin/reports', { params })
      setRows(response.data.rows)
      setHasRun(true)
    } catch (requestError) {
      console.error('Failed to load report', requestError)
      setReportError(requestError.response?.data?.message || 'The report could not be loaded. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="main">
      <div className="admin-page">
        <header className="admin-page-header">
          <div>
            <p className="admin-eyebrow">Administration</p>
            <h1>Reports</h1>
            <p>Review platform usage, assessment activity, and student outcomes.</p>
          </div>
          {hasRun && <button className="button" type="button" onClick={() => exportCsv(rows, reportType)} disabled={!rows.length}>Export CSV</button>}
        </header>

        {directoryError && <p className="admin-report-notice" role="status">{directoryError}</p>}
        <section className="admin-data-card">
          <div className="admin-data-toolbar">
            <div>
              <h2>Report filters</h2>
              <p>Choose a report and narrow results by date, subject, teacher, or test status.</p>
              {reportType === 'platform-usage' && <p>Subject, teacher, and test status filters apply to assessment activity; account signups remain platform-wide.</p>}
            </div>
          </div>
          <form className="admin-report-filters" onSubmit={runReport}>
            <label><span>Report</span><select className="input" value={reportType} onChange={event => setReportType(event.target.value)}>{reportOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span>Start date</span><input className="input" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label>
            <label><span>End date</span><input className="input" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></label>
            <label><span>Subject</span><select className="input" value={subject} onChange={event => setSubject(event.target.value)}><option value="all">All subjects</option>{subjects.map(item => <option value={item._id} key={item._id}>{item.subjectName}</option>)}</select></label>
            <label><span>Teacher</span><select className="input" value={teacher} onChange={event => setTeacher(event.target.value)}><option value="all">All teachers</option>{teachers.map(item => <option value={item._id} key={item._id}>{item.name}</option>)}</select></label>
            <label><span>Test status</span><select className="input" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="drafted">Drafted</option><option value="available">Available</option><option value="upcoming">Upcoming</option><option value="closed">Closed</option></select></label>
            <button className="button admin-report-run" type="submit" disabled={loading}>{loading ? 'Loading report…' : 'Run report'}</button>
          </form>
        </section>

        <section className="admin-data-card admin-report-results">
          <div className="admin-data-toolbar">
            <div><h2>{reportOptions.find(([value]) => value === reportType)?.[1]}</h2><p>{hasRun ? `${rows.length} ${rows.length === 1 ? 'row' : 'rows'} returned` : 'Run a report to view results.'}</p></div>
            {hasRun && <button className="admin-report-export-link" type="button" onClick={() => exportCsv(rows, reportType)} disabled={!rows.length}>Download CSV</button>}
          </div>
          {reportError ? (
            <div className="admin-state-card admin-error-card" role="alert"><span className="admin-state-icon" aria-hidden="true">!</span><div><h2>Report unavailable</h2><p>{reportError}</p></div></div>
          ) : loading ? (
            <p className="admin-report-placeholder" role="status">Preparing report…</p>
          ) : !hasRun ? (
            <p className="admin-report-placeholder">Select filters and run a report to see results.</p>
          ) : rows.length === 0 ? (
            <p className="admin-report-placeholder">No records match these filters.</p>
          ) : (
            <div className="admin-table-scroll">
              <table className="table admin-report-table">
                <thead><tr>{columns.map(column => <th key={column}>{formatHeader(column)}</th>)}</tr></thead>
                <tbody>{rows.map((row, index) => <tr key={`${index}-${row.test || row.title || row.month || ''}`}>{columns.map(column => <td key={column}>{row[column] === null || row[column] === undefined || row[column] === '' ? '—' : String(row[column])}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
