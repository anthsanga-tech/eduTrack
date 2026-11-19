import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login'
import { useAuth } from '../context/AuthContext'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

describe('student sign in', () => {
  let login

  beforeEach(() => {
    login = vi.fn()
    useAuth.mockReturnValue({ login })
  })

  it('submits credentials and renders authentication errors accessibly', async () => {
    login.mockRejectedValue({ response: { data: { message: 'Invalid email or password' } } })
    render(<MemoryRouter><Login /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(login).toHaveBeenCalledWith('student@example.test', 'wrong')
  })
})
