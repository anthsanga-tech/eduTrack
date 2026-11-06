import { useEffect, useRef } from 'react'

export default function ConfirmActionDialog({ action, busy, onCancel, onConfirm }) {
  const dialogRef = useRef(null)
  const confirmRef = useRef(null)

  useEffect(() => {
    if (!action) return undefined

    const previousFocus = document.activeElement
    confirmRef.current?.focus()

    const handleKeyDown = event => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        onCancel()
      }

      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll(
          'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
        if (!focusable?.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [action, busy, onCancel])

  if (!action) return null

  return (
    <div
      className="locking-dialog-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <section
        ref={dialogRef}
        className="locking-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="locking-dialog-title"
        aria-describedby="locking-dialog-description"
      >
        <div className={`locking-dialog-icon ${action.tone || 'neutral'}`} aria-hidden="true">
          {action.icon || '↔'}
        </div>
        <div className="locking-dialog-copy">
          <p className="locking-dialog-eyebrow">{action.eyebrow || 'Please confirm'}</p>
          <h2 id="locking-dialog-title">{action.title}</h2>
          <p id="locking-dialog-description">{action.description}</p>
          {action.note && <p className="locking-dialog-note">{action.note}</p>}
        </div>
        <div className="locking-dialog-actions">
          <button type="button" className="locking-dialog-cancel" onClick={onCancel} disabled={busy}>
            Keep as is
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`locking-dialog-confirm ${action.tone || 'neutral'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Please wait…' : action.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
