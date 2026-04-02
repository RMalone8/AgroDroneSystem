import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './src/App.tsx'
import { AuthProvider } from './src/contexts/AuthContext.tsx'
import { DarkModeProvider } from './src/contexts/DarkModeContext.tsx'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DarkModeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </DarkModeProvider>
  </React.StrictMode>,
)
