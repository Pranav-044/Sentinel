import { Outlet, Navigate, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, LogOut, Github, Activity } from 'lucide-react'
import { useAuth } from './AuthProvider'

export function DashboardLayout() {
  const { user, isLoading, logout } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading Sentinel...</div>
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return (
    <div className="flex h-screen bg-surface-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-surface-900 border-r border-white/5 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-white/5">
          <Activity className="w-6 h-6 text-brand-500 mr-3" />
          <span className="text-lg font-bold text-slate-100 tracking-tight">Sentinel</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <Link
            to="/dashboard"
            className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors
              ${location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/repos')
                ? 'bg-brand-500/10 text-brand-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
          >
            <LayoutDashboard className="w-5 h-5 mr-3" />
            Repositories
          </Link>
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="flex items-center mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-surface-800 border border-white/10 flex items-center justify-center text-slate-300">
              <Github className="w-4 h-4" />
            </div>
            <div className="ml-3 truncate">
              <p className="text-sm font-medium text-slate-200 truncate">{user.login}</p>
              <p className="text-xs text-slate-500 truncate">{user.email || 'No email'}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center w-full px-3 py-2 text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4 mr-3" />
            Log out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto focus:outline-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
