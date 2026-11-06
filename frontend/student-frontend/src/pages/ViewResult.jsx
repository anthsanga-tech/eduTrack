import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import API from '../services/api'
import ResultSummary from '../components/ResultSummary'

export default function ViewResult(){
  const { testId, submittedID } = useParams()
  const [submission, setSubmission] = useState(null)
  const navigate = useNavigate()

  useEffect(()=>{
    const load = async () => {
      const res = await API.get(`/student/tests/${testId}/${submittedID}/result`).catch(()=>({data:null}))
      setSubmission(res.data)
    }
    load()
  }, [testId, submittedID])

  if (!submission) return <div className="app-shell"><Sidebar /><main className="main"><div className="student-results-state empty">No result found for this attempt.</div></main></div>

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main student-view-result-page">
        <button className="student-back-link" onClick={() => navigate("/tests")} type="button">
          ← My tests
        </button>
        {/* <div className="header">
          <h1>Result</h1>
        </div> */}
        <div className="card student-result-detail-card mt-2">
          <ResultSummary result={submission} />
          <section className="student-detailed-answers">
            <div className="student-detail-section-heading">
              <h2>Answer review</h2>
              <p>See how each response compared with the correct answer.</p>
            </div>
            <div className="student-detailed-answer-list">
              {submission.answers.map(a=> (
                <article key={a.question._id} className={`student-result-answer ${a.selected === a.question.correctOption ? 'correct' : 'incorrect'}`}>
                  <span className={`difficulty-badge difficulty-${a.question.difficulty || 'medium'}`}>{a.question.difficulty || 'medium'}</span>
                  <h3 className="student-result-question">{a.question.questionText}</h3>
                  <p className="student-result-answer-text">
                    Your answer: <strong>{a.selected ? `${a.selected.toUpperCase()}. ${a.question.options?.[a.selected] || 'No option text'}` : 'Not answered'}</strong>
                  </p>
                  <p className="student-result-answer-text">
                    Correct answer: <strong>{a.question.correctOption ? `${a.question.correctOption.toUpperCase()}. ` : ''}{a.question.options?.[a.question.correctOption] || 'No option text'}</strong>
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}