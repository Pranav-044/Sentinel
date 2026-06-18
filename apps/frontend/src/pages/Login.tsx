import { useEffect } from 'react'
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom'
import { Shield, Github } from 'lucide-react'
import { config } from '../config'
import { setAccessToken } from '../lib/api'
import { useAuth } from '../components/AuthProvider'

export function Login() {
  const { user, isLoading } = useAuth()

  if (isLoading) return null
  if (user) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg aspect-square bg-brand-500/10 rounded-full blur-3xl opacity-50" />
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-surface-900 border border-white/10 rounded-2xl flex items-center justify-center glow">
            <Shield className="w-8 h-8 text-brand-400" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-100 tracking-tight">
          Welcome to Sentinel
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          AI-Augmented Codebase Health & Technical Debt Platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="card text-center">
          <a
            href={`${config.apiBase}/auth/github/authorize`}
            className="w-full btn-primary justify-center py-2.5 text-base"
          >
            <Github className="w-5 h-5" />
            Continue with GitHub
          </a>
          <p className="mt-4 text-xs text-slate-500">
            By continuing, you agree to Sentinel's Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  )
}

export function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  useEffect(() => {
    // If the backend redirected us here with a token in the URL params
    const token = searchParams.get('token')
    if (token) {
      setAccessToken(token)
      // Redirect to dashboard, strip the token from URL
      window.location.href = '/dashboard'
    } else if (user) {
      navigate('/dashboard', { replace: true })
    } else {
      navigate('/login', { replace: true })
    }
  }, [searchParams, navigate, user])

  return (
    <div className="min-h-screen flex items-center justify-center text-slate-400">
      Authenticating...
    </div>
  )
}
