import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ResultSummary from './ResultSummary'

describe('student result summary', () => {
  it('displays the score and pass result at the configured threshold', () => {
    render(
      <ResultSummary
        result={{ score: 3, correct: 1, wrong: 1, test: { totalMarks: 4 }, passPercentage: 75, timeTakenInSeconds: 65 }}
      />
    )

    expect(screen.getByRole('heading', { name: 'Your result' })).toBeInTheDocument()
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByText('1m 5s')).toBeInTheDocument()
  })

  it('shows a failing outcome below the configured threshold', () => {
    render(
      <ResultSummary
        result={{ score: 1, correct: 1, wrong: 2, test: { totalMarks: 4 }, passPercentage: 50 }}
      />
    )

    expect(screen.getByText('Not passed')).toBeInTheDocument()
  })
})
