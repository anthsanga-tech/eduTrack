import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import './index.css'
import '../../utils/responsive.css'
import '../../utils/theme.css'
import { ThemeProvider } from './context/ThemeContext.tsx'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
<React.StrictMode>
<ThemeProvider>
<BrowserRouter>
<AuthProvider>
<App />
</AuthProvider>
</BrowserRouter>
</ThemeProvider>
</React.StrictMode>
)
