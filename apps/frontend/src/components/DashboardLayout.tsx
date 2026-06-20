import { Outlet, Navigate, NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutDashboard, LogOut, Github, Activity, ChevronRight } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { AnimatedBackground } from './AnimatedBackground'
import { PageTransition } from './PageTransition'
import clsx from 'clsx'

const navItems = [
  { to: '/dashboard', label: 'Repositories', icon: LayoutDashboard, exact: true },
]

export function DashboardLayout() {
  const { user, isLoading, logout } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <AnimatedBackground />
        <div className="flex flex-col items-center gap-3">
          <motion.div
            className="w-8 h-8 rounded-full border-2 border-brand-400 border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <p className="text-sm text-slate-500">Loading Sentinel...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />

  return (
    <div className="flex h-screen overflow-hidden">
      <AnimatedBackground />

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <motion.aside
        className="w-60 flex-shrink-0 flex flex-col z-20 relative"
        style={{
          background: 'rgba(8, 13, 26, 0.8)',
          backdropFilter: 'blur(24px)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
        initial={{ x: -60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-5 gap-3 border-b border-white/5">
          <div className="w-7 h-7 rounded-lg bg-brand-500/15 border border-brand-500/25 flex items-center justify-center">
            <Activity className="w-4 h-4 text-brand-400" />
          </div>
          <span className="text-base font-bold text-slate-100 tracking-tight">Sentinel</span>
          <div className="ml-auto">
            <span className="text-[10px] font-semibold text-brand-400/60 bg-brand-500/10 px-1.5 py-0.5 rounded-full border border-brand-500/15">
              v2
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          <p className="px-3 pb-2 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
            Navigation
          </p>
          {navItems.map(({ to, label, icon: Icon, exact }) => (
            <NavLink key={to} to={to} end={exact}>
              {({ isActive }) => (
                <motion.div
                  className={clsx('nav-link', isActive && 'active')}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-sm">{label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="nav-active-dot"
                      className="w-1.5 h-1.5 rounded-full bg-brand-400"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                </motion.div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-white/5">
          <motion.div
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1"
            style={{ background: 'rgba(255,255,255,0.03)' }}
            whileHover={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500/30 to-violet-500/30 border border-white/10 flex items-center justify-center flex-shrink-0">
              <Github className="w-4 h-4 text-slate-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{user.login}</p>
              <p className="text-[10px] text-slate-500 truncate">{user.email || 'GitHub account'}</p>
            </div>
          </motion.div>

          <motion.button
            onClick={logout}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-slate-500 hover:text-red-400 rounded-lg transition-colors"
            whileHover={{ background: 'rgba(239,68,68,0.06)' }}
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </motion.button>
        </div>
      </motion.aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </div>
      </main>
    </div>
  )
}
