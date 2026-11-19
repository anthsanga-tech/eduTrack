import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import TestList from './TestList'

describe('teacher test list', () => {
  it('shows lifecycle status and only offers actions permitted by the test', () => {
    const handleDelete = vi.fn()
    const handleToggleLock = vi.fn()
    render(
      <MemoryRouter>
        <TestList
          test={{
            _id: 'test-1',
            title: 'Algebra',
            status: 'drafted',
            difficulty: 'medium',
            totalQuestions: 0,
            canView: true,
            canEdit: true,
            canDelete: true,
            canLock: true,
            canUnlock: false,
          }}
          handleDelete={handleDelete}
          handleToggleLock={handleToggleLock}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Drafted')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage questions' })).toHaveAttribute('href', '/tests/manage/test-1')
    fireEvent.click(screen.getByRole('button', { name: /Lock/ }))
    expect(handleToggleLock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Algebra' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(handleDelete).toHaveBeenCalledTimes(1)
  })
})
