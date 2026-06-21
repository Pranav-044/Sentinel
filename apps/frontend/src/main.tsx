import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './components/AuthProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

// ── Lazy-loaded routes (code splitting — DependencyGraph is ~150kB) ──────────
const DashboardLayout = lazy(() =>
  import('./components/DashboardLayout').then(m => ({ default: m.DashboardLayout }))
)
const Login = lazy(() =>
  import('./pages/Login').then(m => ({ default: m.Login }))
)
const OAuthCallback = lazy(() =>
  import('./pages/Login').then(m => ({ default: m.OAuthCallback }))
)
const AuthError = lazy(() =>
  import('./pages/Login').then(m => ({ default: m.AuthError }))
)
const ReposList = lazy(() =>
  import('./pages/ReposList').then(m => ({ default: m.ReposList }))
)
const RepoDashboard = lazy(() =>
  import('./pages/RepoDashboard').then(m => ({ default: m.RepoDashboard }))
)
const NotFound = lazy(() =>
  import('./pages/NotFound').then(m => ({ default: m.NotFound }))
)

// Minimal spinner shown during code-split chunk loading
function SuspenseFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<SuspenseFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<Login />} />
              {/* /auth/callback matches GITHUB_REDIRECT_URI which ends in /auth/callback */}
              <Route path="/auth/callback" element={<OAuthCallback />} />
              <Route path="/auth/error" element={<AuthError />} />

              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<ReposList />} />
                <Route path="repos/:id" element={<RepoDashboard />} />
              </Route>

              {/* Catch-all 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
