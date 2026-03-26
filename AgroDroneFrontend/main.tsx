import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './src/App.tsx'
import { AuthProvider } from './src/contexts/AuthContext.tsx'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
