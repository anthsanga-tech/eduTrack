import { useEffect, useState } from "react";
import API from "../services/api";
import { Link } from "react-router-dom";
import "../assets/css/Question.css";
import "../assets/css/Locking.css";
import Loading from '../components/Loading.jsx'
import ConfirmActionDialog from '../components/ConfirmActionDialog.jsx'
import { showError, showSuccess } from '../../../utils/utils.jsx'
import {
  getQuestionProtectionActions,
  getQuestionProtectionBadges,
} from '../utils/questionProtection.js'

export default function Questions() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError("");
      const res = await API.get(`/teacher/questions`);
      setQuestions(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load questions. Please try again.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const deleteQuestion = (question) => {
    if (!question?.canDelete) {
      showError(question?.deleteProtectionReason || "Only the question owner can delete this question.")
      return
    }
    setConfirmation({
      type: 'delete',
      question,
      eyebrow: 'Permanent action',
      title: 'Delete this question?',
      description: 'This question will be permanently removed from your question bank.',
      note: 'Questions in started examinations or historical records can’t be deleted.',
      confirmLabel: 'Delete question',
      tone: 'danger',
      icon: '×'
    })
  };

  const toggleQuestionLock = (question) => {
    const canChangeLock = question.isManuallyLocked ? question.canUnlock : question.canLock
    if (!canChangeLock) {
      showError(question.protectionReason || "Only the question owner can change its manual lock.")
      return
    }
    const locking = !question.isManuallyLocked
    setConfirmation({
      type: locking ? 'lock' : 'unlock',
      question,
      eyebrow: 'Manual protection',
      title: `${locking ? 'Lock' : 'Unlock'} this question?`,
      description: locking
        ? 'Locking pauses edits and deletion, helping prevent accidental changes to this question.'
        : 'You can edit this question again where automatic exam protections allow it.',
      note: locking
        ? 'Started examinations and examination records have separate, automatic protection.'
        : 'Unlocking does not remove any protection required by started examinations or exam records.',
      confirmLabel: locking ? 'Lock question' : 'Unlock question',
      tone: locking ? 'neutral' : 'success',
      icon: locking ? '⌑' : '↗'
    })
  }

  const closeConfirmation = () => setConfirmation(null)

  const executeConfirmedAction = async () => {
    if (!confirmation || actionBusy) return
    const { type, question } = confirmation
    setActionBusy(true)
    try {
      if (type === 'delete') {
        const { data } = await API.delete(`/teacher/questions/${question._id}`);
        if (!data.success) throw new Error(data.message || "Unable to delete question.")
        setQuestions(previous => previous.filter(item => item._id !== question._id))
        showSuccess(data.message || "Question deleted.")
      } else {
        const { data } = await API.patch(`/teacher/questions/${question._id}/${type}`)
        await fetchQuestions({ silent: true })
        showSuccess(data.message || `Question ${type}ed.`)
      }
      setConfirmation(null)
    } catch (err) {
      if (err.response?.status === 409) await fetchQuestions({ silent: true });
      showError(err.response?.data?.message || err.message || `Unable to ${type} question.`)
    } finally {
      setActionBusy(false)
    }
  }

  const manualLockCount = questions.filter(question => question.isManuallyLocked).length
  const usageProtectedCount = questions.filter(question => question.isInUse).length
  const systemProtectedCount = questions.filter(question => question.isSystemProtected).length

  if (loading) return <Loading />;

  return (
    <main className="main">
      <div className="page question-bank-page">
        {error && (
          <div className="page-feedback page-feedback-error" role="alert">
            <span>{error}</span>
            <button className="question-retry" type="button" onClick={fetchQuestions}>Try again</button>
          </div>
        )}
        <div className="page-header">
          <div>
            <p className="page-eyebrow">Teaching workspace</p>
            <h1>Question bank</h1>
            <p className="page-description">Create and maintain reusable questions for your assessments.</p>
          </div>
          <Link to="/questions/create" className="button">
            + New Question
          </Link>
        </div>

        <div className="locking-explainer" aria-label="How question protection works">
          <div className="locking-explainer-card">
            <span className="locking-explainer-icon" aria-hidden="true">⌑</span>
            <div>
              <strong>Lock questions you own</strong>
              <p>A manual lock prevents edits and deletion until you choose to unlock the question.</p>
            </div>
          </div>
          <div className="locking-explainer-card automatic">
            <span className="locking-explainer-icon" aria-hidden="true">◆</span>
            <div>
              <strong>Keep past exams unchanged</strong>
              <p>Started examinations and examination records protect question content automatically.</p>
            </div>
          </div>
        </div>

        {questions.length > 0 && (
          <div className="locking-counts" aria-label="Question protection summary">
            <span className="locking-count"><strong>{questions.length}</strong> {questions.length === 1 ? 'question' : 'questions'}</span>
            <span className="locking-count"><strong>{manualLockCount}</strong> manually locked</span>
            <span className="locking-count"><strong>{usageProtectedCount}</strong> in use</span>
            <span className="locking-count"><strong>{systemProtectedCount}</strong> system protected</span>
          </div>
        )}

        {error && questions.length === 0 ? null : questions.length === 0 ? (
          <section className="question-empty-state">
            <span className="question-empty-mark" aria-hidden="true">?</span>
            <div>
              <h2>Your question bank is empty</h2>
              <p>Create your first question to start building reusable assessment content.</p>
            </div>
            <Link to="/questions/create" className="button">Create a question</Link>
          </section>
        ) : (
          <section className="question-table-card">
            <div className="question-table-caption">
              <div>
                <h2>Saved questions</h2>
                <p>Your questions at a glance. Only owners can edit or change a manual lock.</p>
              </div>
            </div>
            <div className="locking-question-grid">
              {questions.map((question, index) => {
                const protectionLabels = {
                  system: 'System protected',
                  usage: 'In use · Protected',
                  manual: 'Manually locked',
                }
                const badges = getQuestionProtectionBadges(question)
                const actions = getQuestionProtectionActions(question)

                return (
                  <article className="locking-question-card" key={question._id}>
                    <div className="locking-question-top">
                      <span className="locking-question-index">Question {index + 1}</span>
                      {badges.map(badge => (
                        <span className={`resource-lock-badge ${badge.className}`} key={badge.label}>
                          {badge.label}
                        </span>
                      ))}
                    </div>
                    <p className="locking-question-text">{question.questionText}</p>
                    <div className="locking-question-meta">
                      <span>{question.subject?.subjectName || 'No subject'}</span>
                      <span>{question.mark} {question.mark === 1 ? 'mark' : 'marks'}</span>
                      <span className={`difficulty-badge difficulty-${question.difficulty || 'medium'}`}>
                        {question.difficulty || 'medium'}
                      </span>
                    </div>
                    {question.isProtected && (
                      <div className={`resource-protection-card ${question.protectionType === 'manual' ? 'manual' : ''}`} role="note">
                        <span className="resource-protection-symbol" aria-hidden="true">{question.protectionType === 'manual' ? '⌑' : 'i'}</span>
                        <div>
                          <strong>{protectionLabels[question.protectionType]}</strong>
                          <p>{question.protectionReason}</p>
                          {question.isInUse && question.associatedExaminationCount > 0 && (
                            <div className="resource-lock-meta">
                              Used by {question.associatedExaminationCount} {question.associatedExaminationCount === 1 ? 'examination' : 'examinations'}.
                            </div>
                          )}
                          {question.isInUse && question.associatedExaminations?.length > 0 && (
                            <ul className="question-examination-links" aria-label="Associated examinations">
                              {question.associatedExaminations.map(examination => (
                                <li key={examination._id}>
                                  <Link to={`/tests/manage/${examination._id}`}>{examination.title}</Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="locking-question-actions">
                      {question.isOwner ? (
                        <>
                          {!actions.canEdit
                            ? <button className="btn-question btn-question-edit" type="button" disabled title={question.protectionReason || 'This question cannot be edited until it is removed from editable draft examinations.'}>Edit</button>
                            : <Link to={`/teacher/questions/${question._id}/edit`} className="btn-question btn-question-edit">Edit</Link>}
                          {actions.canUnlock ? (
                            <button
                              type="button"
                              onClick={() => toggleQuestionLock(question)}
                              className="locking-action-button unlock"
                              aria-label={`Unlock question ${index + 1}`}
                            >
                              <span aria-hidden="true">↗</span>
                              Unlock
                            </button>
                          ) : actions.canLock ? (
                            <button
                              type="button"
                              onClick={() => toggleQuestionLock(question)}
                              className="locking-action-button"
                              aria-label={`Lock question ${index + 1}`}
                            >
                              <span aria-hidden="true">↘</span>
                              Lock
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => deleteQuestion(question)}
                            className="btn-question btn-question-delete"
                            disabled={!actions.canDelete}
                            title={question.deleteProtectionReason || undefined}
                          >
                            Delete
                          </button>
                        </>
                      ) : <span className="resource-action-unavailable">Owned by another teacher</span>}
                    </div>
                  </article>
                )
              })}
            </div>
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
  );
}
