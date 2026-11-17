export type Theme = 'light' | 'dark'

export function getStoredTheme(): Theme | null
export function getSystemTheme(): Theme
export function getInitialTheme(): { theme: Theme; hasPreference: boolean }
export function saveTheme(theme: Theme): void
