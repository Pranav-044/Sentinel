import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './components/AuthProvider'
import { DashboardLayout } from './components/DashboardLayout'
import { Login, OAuthCallback } from './pages/Login'
import { ReposList } from './pages/ReposList'
import { RepoDashboard } from './pages/RepoDashboard'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/callback" element={<OAuthCallback />} />
          
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<ReposList />} />
            <Route path="repos/:id" element={<RepoDashboard />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
