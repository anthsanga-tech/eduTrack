import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login'
import { useAuth } from '../context/AuthContext'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

const renderLogin = () => render(
  <MemoryRouter initialEntries={['/login']}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<h1>Dashboard</h1>} />
    </Routes>
  </MemoryRouter>
)

describe('admin sign in', () => {
  let login

  beforeEach(() => {
    login = vi.fn()
    useAuth.mockReturnValue({ login })
  })

  it('submits the entered credentials and navigates to the dashboard', async () => {
    login.mockResolvedValue({ role: 'admin' })
    renderLogin()

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'admin@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(login).toHaveBeenCalledWith('admin@example.test', 'secret')
  })

  it('displays the API error without navigating after a rejected login', async () => {
    login.mockRejectedValue({ response: { data: { message: 'Invalid credentials' } } })
    renderLogin()

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'admin@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials')
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument())
  })
})
