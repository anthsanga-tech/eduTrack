import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import  API  from '../services/api'
import Loading from '../components/Loading.jsx'
import TestList from '../components/TestList.jsx'
import ConfirmActionDialog from '../components/ConfirmActionDialog.jsx'
import { getTestLifecycleActions } from '../utils/testLifecycle.js'
import "../assets/css/Tests.css"
import "../assets/css/Locking.css"
import { showError, showSuccess } from '../../../utils/utils.jsx'

export default function Tests() {
  const [tests, setTests] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [titleFilter, setTitleFilter] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [availabilityFilter, setAvailabilityFilter] = useState('all')
  const [confirmation, setConfirmation] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)

  useEffect(() => {
    fetchTests()
  }, [])

  const fetchTests = async ({ silent = false } = {}) => {
    try {
      setError(false)
      setFeedback('')
      if (!silent) setLoading(true)
      const [testsRes, subjectsRes] = await Promise.all([
        API.get('teacher/tests'),
        API.get('teacher/subjects')
      ])
      setTests(testsRes.data)
      setSubjects(subjectsRes.data)
    } catch (err) {
      console.error('Failed to load tests', err)
      setError(true)
      setFeedback(err.response?.data?.message || 'Tests could not be loaded. Please try again.')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const filteredTests = useMemo(() => {
    const now = new Date()
    const normalizedTitle = titleFilter.trim().toLowerCase()

    return tests.filter(test => {
      if (normalizedTitle && !test.title.toLowerCase().includes(normalizedTitle)) return false
      if (difficultyFilter !== 'all' && test.difficulty !== difficultyFilter) return false
      if (subjectFilter !== 'all' && test.subject !== subjectFilter) return false

      if (availabilityFilter === 'all') return true

      let testAvailability = test.status
      if (test.lifecycleStatus === 'drafted' || test.status === 'drafted' || test.status === 'draft') {
        testAvailability = 'drafted'
      } else if (test.status === 'closed') {
        testAvailability = 'closed'
      } else if (test.status === 'published') {
        testAvailability = test.startTime && now < new Date(test.startTime) ? 'upcoming' : 'available'
      }

      return testAvailability === availabilityFilter
    })
  }, [tests, titleFilter, difficultyFilter, subjectFilter, availabilityFilter])

  const handleDelete = (test) => {
    if (!getTestLifecycleActions(test).canDelete) {
      showError(test?.deleteProtectionReason || 'This test cannot be deleted in its current state.')
      return
    }
    setConfirmation({
      type: 'delete',
      test,
      eyebrow: 'Permanent action',
      title: 'Delete this test?',
      description: `“${test.title}” will be permanently removed. This can’t be undone.`,
      note: 'Tests with examination records cannot be deleted. Those results remain protected.',
      confirmLabel: 'Delete test',
      tone: 'danger',
      icon: '×'
    })
  }

  const handleToggleLock = (test) => {
    const actions = getTestLifecycleActions(test)
    const isLocked = Boolean(test.isManuallyLocked ?? test.isLocked)
    const canChangeLock = isLocked ? actions.canUnlock : actions.canLock
    if (!canChangeLock) {
      showError(isLocked
        ? test.unlockProtectionReason || 'This test cannot be unlocked in its current lifecycle state.'
        : test.lockProtectionReason || 'This test cannot be locked in its current lifecycle state.')
      return
    }
    const locking = !isLocked
    setConfirmation({
      type: locking ? 'lock' : 'unlock',
      test,
      eyebrow: 'Manual protection',
      title: `${locking ? 'Lock' : 'Unlock'} this test?`,
      description: locking
        ? `While locked, “${test.title}” can’t be edited, changed, or deleted.`
        : `You can edit “${test.title}” again while it remains drafted.`,
      note: locking
        ? 'Locking does not change the drafted lifecycle status.'
        : 'Published and closed tests cannot be manually unlocked.',
      confirmLabel: locking ? 'Lock test' : 'Unlock test',
      tone: locking ? 'neutral' : 'success',
      icon: locking ? '⌑' : '↗'
    })
  }

  const closeConfirmation = () => setConfirmation(null)

  const executeConfirmedAction = async () => {
    if (!confirmation || actionBusy) return
    const { type, test } = confirmation
    setActionBusy(true)
    try {
      if (type === 'delete') {
        const { data } = await API.delete(`/teacher/tests/${test._id}`)
        if (!data.success) throw new Error(data.message || 'Unable to delete test.')
        setTests(previous => previous.filter(item => item._id !== test._id))
        showSuccess(data.message || 'Test deleted.')
      } else {
        const endpoint = type
        const { data } = await API.patch(`/teacher/tests/${test._id}/${endpoint}`)
        await fetchTests({ silent: true })
        showSuccess(data.message || `Test ${type}ed.`)
      }
      setConfirmation(null)
    } catch (err) {
      showError(err.response?.data?.message || err.message || `Unable to ${type} test.`)
    } finally {
      setActionBusy(false)
    }
  }

  if (loading) return <Loading />

  return (
      <main className="main">
         <div className="page tests-page">
        <div className="page-header">
          <div>
            <p className="page-eyebrow">Teaching workspace</p>
            <h1>My tests</h1>
            <p className="page-description">Create assessments, manage their questions, and keep an eye on submissions.</p>
          </div>
          <Link className="button no-underline" to="/tests/create">
            + Create test
          </Link>
        </div>
      {error ? (
        <div className="question-empty-state" role="alert">
          <span className="question-empty-mark" aria-hidden="true">!</span>
          <div>
            <h2>Tests could not be loaded</h2>
            <p>{feedback || 'Please check your connection and try again.'}</p>
          </div>
          <button className="button" type="button" onClick={fetchTests}>Try again</button>
        </div>
      ) : tests.length === 0 ? (
        <section className="question-empty-state">
          <span className="question-empty-mark" aria-hidden="true">+</span>
          <div>
            <h2>No tests created yet</h2>
            <p>Create an assessment, assign students, then add questions to get started.</p>
          </div>
          <Link className="button no-underline" to="/tests/create">Create your first test</Link>
        </section>
      ) : (
        <section className="tests-list-card">
          <div className="locking-explainer" aria-label="How test protection works">
            <div className="locking-explainer-card">
              <span className="locking-explainer-icon" aria-hidden="true">⌑</span>
              <div>
                <strong>Your lock, your choice</strong>
                <p>Manual locking is available only while a test is drafted. It does not change the lifecycle status.</p>
              </div>
            </div>
            <div className="locking-explainer-card automatic">
              <span className="locking-explainer-icon" aria-hidden="true">◆</span>
              <div>
                <strong>Exam records stay safe</strong>
                <p>Publishing makes test content immutable. Closing stops new attempts while preserving existing records.</p>
              </div>
            </div>
          </div>
          {feedback && <p className="resource-action-feedback" role="status">{feedback}</p>}
          <div className="tests-filter-grid" aria-label="Filter tests">
            <label className="tests-filter-field">
              <span>Title</span>
              <input
                className="input"
                type="search"
                placeholder="Search by title"
                value={titleFilter}
                onChange={event => setTitleFilter(event.target.value)}
              />
            </label>
            <label className="tests-filter-field">
              <span>Difficulty</span>
              <select className="input" value={difficultyFilter} onChange={event => setDifficultyFilter(event.target.value)}>
                <option value="all">All difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Difficult</option>
                <option value="mixed">Mixed</option>
              </select>
            </label>
            <label className="tests-filter-field">
              <span>Subject</span>
              <select className="input" value={subjectFilter} onChange={event => setSubjectFilter(event.target.value)}>
                <option value="all">All subjects</option>
                {subjects.map(subject => (
                  <option key={subject._id} value={subject._id}>{subject.subjectName}</option>
                ))}
              </select>
            </label>
            <label className="tests-filter-field">
              <span>Availability</span>
              <select className="input" value={availabilityFilter} onChange={event => setAvailabilityFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="closed">Closed</option>
                <option value="available">Available</option>
                <option value="drafted">Drafted</option>
                <option value="upcoming">Upcoming</option>
              </select>
            </label>
          </div>
          <div className="question-table-caption">
            <div>
              <h2>Your assessments</h2>
              <p>Showing {filteredTests.length} of {tests.length} {tests.length === 1 ? 'test' : 'tests'}</p>
            </div>
          </div>
          {filteredTests.length > 0 ? (
            <ul className="tests-list">
              {filteredTests.map(test => (
                <TestList
                  key={test._id}
                  test={test}
                  handleDelete={handleDelete}
                  handleToggleLock={handleToggleLock}
                />
              ))}
            </ul>
          ) : (
            <p className="tests-filter-empty">No tests match the selected filters.</p>
          )}
        </section>
      )}
    </div>
    <ConfirmActionDialog
      action={confirmation}
      busy={actionBusy}
      onCancel={closeConfirmation}
      onConfirm={executeConfirmedAction}
    />
    </main>
  )
}
