import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import QuestionForm from './QuestionForm'

describe('question editor', () => {
  it('requires question text and all choices before saving', () => {
    const onSubmit = vi.fn()
    const { container } = render(<QuestionForm onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save Question' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.querySelector('textarea')).toBeInvalid()
  })

  it('submits the selected correct choice and clears the editor', () => {
    const onSubmit = vi.fn()
    const { container } = render(<QuestionForm onSubmit={onSubmit} />)

    fireEvent.change(container.querySelector('textarea'), { target: { value: 'Question text' } })
    ;['A', 'B', 'C', 'D'].forEach((choice, index) => {
      fireEvent.change(screen.getByPlaceholderText(`Option ${index + 1}`), {
        target: { value: `Choice ${choice}` },
      })
    })
    fireEvent.click(screen.getAllByRole('radio')[2])
    fireEvent.click(screen.getByRole('button', { name: 'Save Question' }))

    expect(onSubmit).toHaveBeenCalledWith({
      question: 'Question text',
      options: ['Choice A', 'Choice B', 'Choice C', 'Choice D'],
      correctIndex: 2,
    })
    expect(container.querySelector('textarea')).toHaveValue('')
  })
})
