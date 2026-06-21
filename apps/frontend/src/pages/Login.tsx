import { useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, Github, ArrowRight, Activity, GitBranch, Zap, AlertTriangle } from 'lucide-react'
import { setAccessToken } from '../lib/api'
import { useAuth } from '../components/AuthProvider'
import { AnimatedBackground } from '../components/AnimatedBackground'

// ── Feature pills ──────────────────────────────────────────────────────────

const features = [
  { icon: Activity, label: 'Real-time health scoring' },
  { icon: GitBranch, label: 'Dependency graph analysis' },
  { icon: Zap, label: 'AI-powered hotspot detection' },
]

// ── Login ──────────────────────────────────────────────────────────────────

export function Login() {
  const { user, isLoading } = useAuth()

  if (isLoading) return null
  if (user) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <AnimatedBackground />

      {/* Floating dots in background */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full bg-brand-400/30"
          style={{
            left: `${15 + i * 14}%`,
            top: `${20 + (i % 3) * 25}%`,
          }}
          animate={{
            y: [0, -20, 0],
            opacity: [0.3, 0.7, 0.3],
          }}
          transition={{
            duration: 3 + i * 0.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.4,
          }}
        />
      ))}

      {/* Logo */}
      <motion.div
        className="flex flex-col items-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="relative w-20 h-20 mb-5"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* Glow ring */}
          <motion.div
            className="absolute inset-0 rounded-2xl"
            animate={{ boxShadow: ['0 0 30px rgba(99,102,241,0.3)', '0 0 60px rgba(99,102,241,0.5)', '0 0 30px rgba(99,102,241,0.3)'] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          <div className="w-full h-full glass-bright rounded-2xl flex items-center justify-center relative">
            <Shield className="w-10 h-10 text-brand-400" />
          </div>
        </motion.div>

        <motion.h1
          className="text-4xl font-black tracking-tight"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
        >
          <span className="text-gradient">Sentinel</span>
        </motion.h1>

        <motion.p
          className="mt-2 text-slate-400 text-center max-w-xs text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          AI-Augmented Codebase Health &amp; Technical Debt Platform
        </motion.p>
      </motion.div>

      {/* Card */}
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="card">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-100">Get started</h2>
            <p className="text-sm text-slate-500 mt-1">Connect your GitHub account to analyse your repositories.</p>
          </div>

          {/* GitHub OAuth CTA */}
          <motion.a
            href="/api/auth/github/authorize"
            className="btn-primary w-full justify-center py-3 text-base"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Github className="w-5 h-5" />
            Continue with GitHub
            <ArrowRight className="w-4 h-4 ml-auto opacity-60" />
          </motion.a>

          {/* Features */}
          <div className="mt-6 pt-5 border-t border-white/6 space-y-3">
            {features.map(({ icon: Icon, label }, i) => (
              <motion.div
                key={label}
                className="flex items-center gap-3 text-sm text-slate-400"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.08 }}
              >
                <div className="w-6 h-6 rounded-md bg-brand-500/10 border border-brand-500/15 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 text-brand-400" />
                </div>
                {label}
              </motion.div>
            ))}
          </div>
        </div>

        <motion.p
          className="mt-4 text-center text-xs text-slate-600"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          By continuing you agree to the Terms of Service &amp; Privacy Policy.
        </motion.p>
      </motion.div>
    </div>
  )
}

// ── OAuthCallback ──────────────────────────────────────────────────────────
// The backend redirects to /auth/callback#token=<jwt> (hash fragment).
// Hash fragments are never sent to the server (XSS-safe), so we read
// them client-side from window.location.hash.

export function OAuthCallback() {
  const navigate = useNavigate()
  const { user } = useAuth()

  useEffect(() => {
    // Parse hash fragment: "#token=eyJ..."
    const hash = window.location.hash // e.g. "#token=eyJhbGci..."
    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const token = params.get('token')

    if (token) {
      setAccessToken(token)
      // Clear the hash from URL so the token isn't visible in browser history
      window.history.replaceState(null, '', window.location.pathname)
      window.location.href = '/dashboard'
    } else if (user) {
      navigate('/dashboard', { replace: true })
    } else {
      navigate('/login?error=auth_failed', { replace: true })
    }
  }, [navigate, user])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <AnimatedBackground />
      <motion.div
        className="flex flex-col items-center gap-4"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="w-10 h-10 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
        <p className="text-slate-400 text-sm">Completing authentication...</p>
      </motion.div>
    </div>
  )
}

// ── AuthError ──────────────────────────────────────────────────────────────
// Shown when GitHub OAuth returns an error (user denied, etc)

export function AuthError() {
  const navigate = useNavigate()
  // Read reason from query string: /auth/error?reason=access_denied
  const reason = new URLSearchParams(window.location.search).get('reason') ?? 'unknown'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <AnimatedBackground />
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="card text-center py-10">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-100 mb-1">Authentication failed</h2>
          <p className="text-sm text-slate-500 mb-6">
            {reason === 'access_denied'
              ? 'You denied access to GitHub. Please try again.'
              : reason === 'token_exchange_failed'
              ? 'Could not exchange the authorization code. Please try again.'
              : `An error occurred: ${reason}`}
          </p>
          <motion.button
            className="btn-primary w-full justify-center"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/login', { replace: true })}
          >
            <Github className="w-4 h-4" />
            Try again
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
