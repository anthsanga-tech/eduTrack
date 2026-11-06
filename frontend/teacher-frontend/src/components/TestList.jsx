import React from 'react'
import { Link } from 'react-router-dom'
import {
  getTestLifecycleActions,
  getTestLifecycleBadges,
} from '../utils/testLifecycle.js'

export default function TestList({ test, handleDelete, handleToggleLock }) {
  const actions = getTestLifecycleActions(test)
  const badges = getTestLifecycleBadges(test)
  const statusClassName = `test-status-badge test-status-${badges.status}`
  const createdDate = test.createdAt ? new Date(test.createdAt).toLocaleDateString() : '—'
  const difficultyLabel = test.difficulty === 'mixed'
    ? `Mixed (${(test.difficultyTags || []).map(tag => tag === 'hard' ? 'Difficult' : tag).join(' + ')})`
    : test.difficulty === 'hard' ? 'Difficult' : test.difficulty || 'medium'

  return (
    <li className="test-item">
      <div className="test-info">
        <div className="test-title-row">
          <strong className="test-title">{test.title}</strong>
          <span className={statusClassName}>{badges.statusLabel}</span>
          {badges.isManuallyLocked && <span className="resource-lock-badge is-locked">Locked</span>}
          {badges.isInUse && <span className="resource-lock-badge is-protected">In use</span>}
          <span className={`difficulty-badge difficulty-${test.difficulty || 'medium'}`}>{difficultyLabel}</span>
          {test.totalQuestions > 0
            ? <span className="test-question-count">{test.totalQuestions} questions</span>
            : <span className="test-question-count test-question-count-empty">No questions</span>}
        </div>
        <div className="test-date">
          <span>Created {createdDate}</span>
          {test.startTime && <span>Starts {new Date(test.startTime).toLocaleString()}</span>}
        </div>
        <div className="test-meta">
          <span className="meta-item">Attempts <strong>{test.attemptRules?.maxAttempts ?? 1}</strong></span>
          <span className="meta-item">Examination records <strong>{badges.attemptCount}</strong></span>
          <span className="meta-item">Students submitted <strong>{test.distinctStudentsSubmitted ?? 0}</strong></span>
        </div>
      </div>

      <div className="test-management-panel">
        <div className="test-actions">
          {actions.canView && (
            <Link
              to={`/tests/${actions.canEdit ? 'manage' : 'view'}/${test._id}`}
              className="btn-test btn-test-manage"
            >
              {actions.canEdit ? 'Manage questions' : 'View'}
            </Link>
          )}
          {actions.canEdit
            ? <Link to={`/tests/edit/${test._id}`} className="btn-test btn-test-edit">Edit test</Link>
            : <button type="button" className="btn-test btn-test-edit" disabled title={test.editProtectionReason || 'This test is view-only.'}>Edit test</button>}

          {actions.canLock && (
            <button type="button" onClick={() => handleToggleLock(test)} className="locking-action-button">
              <span aria-hidden="true">↘</span> Lock
            </button>
          )}
          {actions.canUnlock && (
            <button type="button" onClick={() => handleToggleLock(test)} className="locking-action-button unlock">
              <span aria-hidden="true">↗</span> Unlock
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDelete(test)}
            className="btn-test btn-test-delete"
            disabled={!actions.canDelete}
            title={test.deleteProtectionReason || undefined}
          >
            Delete
          </button>
        </div>

        {badges.isManuallyLocked && (
          <div className="resource-protection-card manual" role="note">
            <span className="resource-protection-symbol" aria-hidden="true">⌑</span>
            <div>
              <strong>Drafted test locked</strong>
              <p>{test.editProtectionReason || 'Unlock this drafted test to edit it.'}</p>
            </div>
          </div>
        )}
        {badges.isInUse && (
          <div className="resource-protection-card" role="note">
            <span className="resource-protection-symbol" aria-hidden="true">i</span>
            <div>
              <strong>Examination records are preserved</strong>
              <p>{badges.attemptCount} recorded {badges.attemptCount === 1 ? 'attempt' : 'attempts'} are associated with this test.</p>
            </div>
          </div>
        )}
      </div>
    </li>
  )
}
