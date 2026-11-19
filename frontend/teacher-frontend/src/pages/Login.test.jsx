import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login'
import { useAuth } from '../context/AuthContext'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

describe('teacher sign in', () => {
  let login

  beforeEach(() => {
    login = vi.fn()
    useAuth.mockReturnValue({ login })
  })

  it('shows an authentication error from the server', async () => {
    login.mockRejectedValue({ response: { data: { message: 'Account role mismatch' } } })
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<Login />} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'teacher@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Account role mismatch')
    expect(login).toHaveBeenCalledWith('teacher@example.test', 'secret')
  })
})
