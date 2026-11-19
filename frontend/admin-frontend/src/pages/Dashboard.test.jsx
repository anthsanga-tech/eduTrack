import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import API from '../services/api'

vi.mock('../services/api', () => ({ default: { get: vi.fn() } }))

const renderDashboard = () => render(
  <MemoryRouter>
    <Dashboard />
  </MemoryRouter>
)

describe('admin dashboard', () => {
  it('renders platform analytics after loading', async () => {
    API.get.mockResolvedValue({
      data: {
        totals: { students: 12, teachers: 2, tests: 4, submissions: 8, subjects: 3 },
        trends: { users: [], tests: [], submissions: [] },
        subjectPerformance: [],
        testOversight: [],
      },
    })
    renderDashboard()

    expect(await screen.findByRole('heading', { name: 'Learning community overview' })).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Performance by subject')).toBeInTheDocument()
  })

  it('shows a recoverable error when analytics cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    API.get.mockRejectedValue(new Error('offline'))
    renderDashboard()

    expect(await screen.findByRole('alert')).toHaveTextContent('Analytics could not be loaded')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
