import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/dashboard'
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="min-h-screen flex items-center justify-center p-8">
          <motion.div
            className="card max-w-md w-full text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-100 mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-400 mb-1">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <p className="text-xs text-slate-600 mb-6">
              The error has been logged. Please refresh or go back to the dashboard.
            </p>
            <button onClick={this.handleReset} className="btn-primary mx-auto">
              <RefreshCw className="w-4 h-4" />
              Back to Dashboard
            </button>
          </motion.div>
        </div>
      )
    }
    return this.props.children
  }
}
