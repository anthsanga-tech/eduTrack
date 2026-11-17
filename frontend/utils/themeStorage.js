const STORAGE_KEY = 'edutrack.theme'

export function getStoredTheme() {
  try {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY)
    return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : null
  } catch {
    return null
  }
}

export function getSystemTheme() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function getInitialTheme() {
  const storedTheme = typeof window !== 'undefined' ? getStoredTheme() : null
  return {
    theme: storedTheme || getSystemTheme(),
    hasPreference: Boolean(storedTheme),
  }
}

export function saveTheme(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Theme changes still apply for the current session when storage is unavailable.
  }
}