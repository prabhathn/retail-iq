import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { DateAnchorProvider } from './contexts/DateAnchorContext'
import { FiltersProvider } from './contexts/FiltersContext'
import { DashboardProvider } from './contexts/DashboardContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DateAnchorProvider>
          <FiltersProvider>
            <DashboardProvider>
              <App />
            </DashboardProvider>
          </FiltersProvider>
        </DateAnchorProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

