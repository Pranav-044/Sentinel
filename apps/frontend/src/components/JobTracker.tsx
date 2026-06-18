import { useEffect, useState } from 'react'
import { CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react'
import { config } from '../config'
import { getAccessToken } from '../lib/api'

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface JobState {
  status: JobStatus
  error?: string
}

export function JobTracker({ jobId, onComplete }: { jobId: string; onComplete?: () => void }) {
  const [state, setState] = useState<JobState>({ status: 'pending' })

  useEffect(() => {
    const token = getAccessToken()
    if (!token) return

    // Connect to API Gateway WebSocket
    const ws = new WebSocket(`${config.wsBase}/ws/jobs/${jobId}?token=${token}`)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'job:started') {
          setState({ status: 'processing' })
        } else if (data.type === 'job:completed') {
          setState({ status: 'completed' })
          onComplete?.()
        } else if (data.type === 'job:failed') {
          setState({ status: 'failed', error: data.payload.error })
        }
      } catch (err) {
        console.error('Failed to parse WS message', err)
      }
    }

    return () => {
      ws.close()
    }
  }, [jobId, onComplete])

  const steps = [
    { id: 'pending', name: 'Queued', activeIcon: CircleDashed, completedIcon: CheckCircle2 },
    { id: 'processing', name: 'Analysis Engine Running', activeIcon: Loader2, completedIcon: CheckCircle2 },
    { id: 'completed', name: 'Finalizing Health Score', activeIcon: Loader2, completedIcon: CheckCircle2 },
  ]

  const getCurrentStepIndex = () => {
    if (state.status === 'pending') return 0
    if (state.status === 'processing') return 1
    if (state.status === 'completed' || state.status === 'failed') return 2
    return 0
  }

  const currentIdx = getCurrentStepIndex()

  return (
    <div className="card w-full max-w-2xl mx-auto">
      <h3 className="text-sm font-medium text-slate-300 mb-6">Live Analysis Progress</h3>
      
      {state.status === 'failed' ? (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start">
          <XCircle className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-red-400">Analysis Failed</h4>
            <p className="mt-1 text-sm text-red-400/80">{state.error || 'An unknown error occurred during analysis.'}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {steps.map((step, idx) => {
            const isCompleted = idx < currentIdx || state.status === 'completed'
            const isActive = idx === currentIdx && state.status !== 'completed'
            const Icon = isCompleted ? step.completedIcon : (isActive ? step.activeIcon : CircleDashed)

            return (
              <div key={step.id} className="flex items-center">
                <div className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full border-2 
                  ${isCompleted ? 'bg-brand-500 border-brand-500 text-white' : 
                    isActive ? 'border-brand-400 text-brand-400' : 
                    'border-slate-700 text-slate-600'}`}>
                  <Icon className={`w-4 h-4 ${isActive ? 'animate-spin' : ''}`} />
                </div>
                <div className="ml-4 min-w-0 flex-1">
                  <p className={`text-sm font-medium ${isCompleted || isActive ? 'text-slate-200' : 'text-slate-500'}`}>
                    {step.name}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
