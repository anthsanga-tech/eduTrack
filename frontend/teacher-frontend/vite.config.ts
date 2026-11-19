import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode === 'production') {
    const apiUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL?.trim()
    if (!apiUrl || !apiUrl.startsWith('https://')) {
      throw new Error('Set VITE_API_URL to the HTTPS backend API URL before a production build')
    }
  }

  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      clearMocks: true,
    },
  }
})
