import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, CircleDashed, XCircle, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { config } from '../config'
import { getAccessToken } from '../lib/api'

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface JobState {
  status: JobStatus
  error?: string
}

const steps = [
  { id: 'pending',    label: 'Job queued',               desc: 'Waiting for an available worker' },
  { id: 'processing', label: 'Cloning & parsing code',   desc: 'Tree-Sitter AST analysis in progress' },
  { id: 'analyzing',  label: 'Calculating health score', desc: 'Running complexity & churn analysis' },
  { id: 'completed',  label: 'Analysis complete',        desc: 'Results saved to dashboard' },
]

export function JobTracker({ jobId, onComplete }: { jobId: string; onComplete?: () => void }) {
  const [state, setState] = useState<JobState>({ status: 'pending' })
  const [stepIdx, setStepIdx] = useState(0)

  useEffect(() => {
    const token = getAccessToken()
    if (!token) return
    const ws = new WebSocket(`${config.wsBase}/ws/jobs/${jobId}?token=${token}`)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'job:started') {
          setState({ status: 'processing' })
          setStepIdx(1)
        } else if (data.type === 'job:analyzing') {
          setStepIdx(2)
        } else if (data.type === 'job:completed') {
          setStepIdx(3)
          setState({ status: 'completed' })
          setTimeout(() => onComplete?.(), 1200)
        } else if (data.type === 'job:failed') {
          setState({ status: 'failed', error: data.payload?.error })
        }
      } catch {}
    }
    return () => ws.close()
  }, [jobId, onComplete])

  return (
    <motion.div
      className="card shimmer"
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center gap-3 mb-6">
        <motion.div
          className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center"
          animate={{ rotate: state.status === 'processing' ? 360 : 0 }}
          transition={{ duration: 2, repeat: state.status === 'processing' ? Infinity : 0, ease: 'linear' }}
        >
          <Zap className="w-4 h-4 text-brand-400" />
        </motion.div>
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Live Analysis Progress</h3>
          <p className="text-xs text-slate-500">Job {jobId.slice(0, 8)}...</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {state.status === 'failed' ? (
          <motion.div
            key="failed"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-start gap-3 p-4 rounded-xl bg-red-500/8 border border-red-500/20"
          >
            <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-400">Analysis Failed</p>
              <p className="text-xs text-red-400/70 mt-0.5">{state.error || 'An unexpected error occurred.'}</p>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-1">
            {steps.map((step, idx) => {
              const isDone    = idx < stepIdx
              const isActive  = idx === stepIdx && state.status !== 'completed'
              const isPending = idx > stepIdx

              return (
                <motion.div
                  key={step.id}
                  className="flex items-center gap-4 p-3 rounded-xl transition-all"
                  style={{
                    background: isActive ? 'rgba(99,102,241,0.06)' : 'transparent',
                    border: isActive ? '1px solid rgba(99,102,241,0.15)' : '1px solid transparent',
                  }}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.07 }}
                >
                  {/* Step icon */}
                  <div className="relative flex-shrink-0">
                    {isDone ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                      >
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      </motion.div>
                    ) : isActive ? (
                      <div className="relative w-5 h-5">
                        <motion.div
                          className="absolute inset-0 rounded-full border-2 border-brand-400"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                          style={{ borderTopColor: 'transparent' }}
                        />
                      </div>
                    ) : (
                      <CircleDashed className="w-5 h-5 text-slate-600" />
                    )}
                    {/* Active pulse ring */}
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 rounded-full border border-brand-400/40"
                        animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}
                  </div>

                  {/* Labels */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${
                      isDone ? 'text-slate-300' : isActive ? 'text-slate-100' : 'text-slate-600'
                    }`}>
                      {step.label}
                    </p>
                    {isActive && (
                      <motion.p
                        className="text-xs text-slate-500 mt-0.5"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        {step.desc}
                      </motion.p>
                    )}
                  </div>

                  {isDone && (
                    <motion.span
                      className="text-xs text-emerald-400/70 font-medium"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      Done
                    </motion.span>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </AnimatePresence>

      {/* Completion celebration */}
      <AnimatePresence>
        {state.status === 'completed' && (
          <motion.div
            className="mt-4 flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-400">Analysis complete — refreshing dashboard</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
