import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { DashboardProvider } from './state/DashboardContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/desafiotrauma">
      <DashboardProvider>
        <App />
      </DashboardProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
