import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import API from '../services/api'
import TakeTest from './TakeTest'

vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../components/Sidebar', () => ({ default: () => <nav aria-label="Main navigation" /> }))
vi.mock('../components/Timer', () => ({ default: () => <div data-testid="timer" /> }))
vi.mock('../components/SubmitModal', () => ({ default: () => null }))

describe('student test-taking interface', () => {
  beforeEach(() => {
    API.get.mockResolvedValue({
      data: {
        test: { title: 'Arithmetic check', durationMinutes: 10, subject: { subjectName: 'Math' } },
        questions: [{
          _id: 'question-1',
          questionText: 'What is 2 + 2?',
          options: { a: '3', b: '4', c: '5', d: '6' },
        }],
      },
    })
    API.post.mockResolvedValue({ data: { submissionId: 'attempt-1' } })
  })

  it('renders a question and updates progress when an answer is selected', async () => {
    render(
      <MemoryRouter initialEntries={['/tests/test-1']}>
        <Routes>
          <Route path="/tests/:testId" element={<TakeTest />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Arithmetic check' })).toBeInTheDocument()
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'B 4' }))

    expect(screen.getByText('Answered', { selector: 'span.student-answer-state' })).toBeInTheDocument()
    expect(screen.getByText('Progress').parentElement).toHaveTextContent('1 / 1')
  })
})
