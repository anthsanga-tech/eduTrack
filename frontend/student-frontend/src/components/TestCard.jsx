import React from 'react'
import { Link } from 'react-router-dom'

export default function TestCard({ test, testStatus, testAccess }){
  const attemptText = `${testAccess?.attemptCount ?? 0}/${testAccess?.maxAttempts ?? 1} used`;
  const canStart = testAccess && testAccess.canStart
  const canView = testAccess && testAccess.canViewResult
  const canRetake = testAccess && testAccess.canRetake
  const statusClassName = testStatus === 'published'
    ? 'test-status test-status-active'
    : testStatus === 'upcoming'
      ? 'test-status test-status-upcoming'
      : 'test-status test-status-closed'
  const dateValue = testStatus === 'upcoming' ? test.startTime : testStatus === 'published' ? test.dueDate : null
  const dateLabel = testStatus === 'upcoming' ? 'Available from' : testStatus === 'published' ? 'Due' : null
  const testDateTime = dateValue ? new Date(dateValue).toLocaleString() : null
  const difficultyLabel = test.difficulty === 'mixed'
    ? `Mixed (${(test.difficultyTags || []).map(tag => tag === 'hard' ? 'Difficult' : tag).join(' + ')})`
    : test.difficulty === 'hard' ? 'Difficult' : test.difficulty || 'medium'

  return (
    <article className="student-test-card">
      <div className="student-test-heading">
        <div className="student-test-title-group">
          <span className="test-subject-mark" aria-hidden="true">T</span>
          <div className="student-test-title-copy">
            <h3 className="student-test-title">{test.title}</h3>
            <p className="student-test-subject">{test.subject?.subjectName || 'General subject'}</p>
            <span className={`difficulty-badge difficulty-${test.difficulty || 'medium'}`}>{difficultyLabel}</span>
          </div>
        </div>
        <span className={statusClassName}>
          {testStatus === 'published' ? 'Available' : testStatus || 'No status'}
        </span>
      </div>

      {dateLabel && testDateTime && (
        <p className="student-test-date">
          <span aria-hidden="true">◷</span>
          <span>{dateLabel}: <strong>{testDateTime}</strong></span>
        </p>
      )}

      <div className="student-test-details">
        <div className="student-test-detail">
          <span className="student-test-detail-label">Questions</span>
          <strong>{test.totalQuestions}</strong>
        </div>
        <div className="student-test-detail">
          <span className="student-test-detail-label">Duration</span>
          <strong>{test.durationMinutes} min</strong>
        </div>
        <div className="student-test-detail">
          <span className="student-test-detail-label">Attempts</span>
          <strong>{attemptText}</strong>
        </div>
      </div>

      <div className="student-test-actions">
        {canStart
          ? <Link to={`/tests/${test._id}/take`} className="student-test-action student-test-action-primary">{testAccess?.attemptCount > 0 ? 'Continue test' : 'Start test'} <span aria-hidden="true">→</span></Link>
          : <button className="student-test-action student-test-action-disabled" disabled>Start test</button>}
        {canView
          ? <Link to={`/tests/${test._id}/results`} className="student-test-action student-test-action-secondary">Results</Link>
          : <button className="student-test-action student-test-action-disabled" disabled>Results</button>}
        {canRetake
          ? <Link to={`/tests/${test._id}/take?retake=1`} className="student-test-action student-test-action-secondary">Retake</Link>
          : <button className="student-test-action student-test-action-disabled" disabled>Retake</button>}
      </div>
    </article>
  )
}
