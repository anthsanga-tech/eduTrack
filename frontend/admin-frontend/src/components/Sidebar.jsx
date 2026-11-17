import React, { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Sidebar() {
  const { logout, user } = useAuth()
  const [navigationOpen, setNavigationOpen] = useState(false)

  useEffect(() => {
    if (!navigationOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = event => {
      if (event.key === 'Escape') setNavigationOpen(false)
    }
    const closeOnDesktopResize = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) setNavigationOpen(false)
    }
    const desktopBreakpoint = window.matchMedia('(min-width: 1024px)')

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeOnDesktopResize)
    desktopBreakpoint.addEventListener('change', closeOnDesktopResize)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeOnDesktopResize)
      desktopBreakpoint.removeEventListener('change', closeOnDesktopResize)
    }
  }, [navigationOpen])

  return (
    <>
      <button
        className="mobile-nav-toggle"
        type="button"
        aria-label={navigationOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-controls="admin-navigation"
        aria-expanded={navigationOpen}
        onClick={() => setNavigationOpen(open => !open)}
      >
        <span /><span /><span />
      </button>
      {navigationOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setNavigationOpen(false)}
        />
      )}
      <aside id="admin-navigation" className={`sidebar ${navigationOpen ? 'is-open' : ''}`}>
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">e</span>
          <div>
            <p className="brand-name">eduTrack</p>
            <p className="brand-role">Administration</p>
          </div>
        </div>
        <div className="sidebar-user">
          <p className="sidebar-user-label">Signed in as</p>
          <p className="sidebar-user-name">{user?.name || 'Admin'}</p>
        </div>
        <nav className="sidebar-nav" aria-label="Admin navigation" onClick={() => setNavigationOpen(false)}>
          <NavLink to="/dashboard" className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}>Dashboard</NavLink>
          <NavLink to="/manage-users" className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}>Manage Users</NavLink>
          <NavLink to="/subjects" className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}>Subjects</NavLink>
          <NavLink to="/reports" className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}>Reports</NavLink>
        </nav>
        <div className="sidebar-footer">
          <button onClick={() => { setNavigationOpen(false); logout() }} className="button">Log out</button>
        </div>
      </aside>
    </>
  )
}
