import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ShieldAlert, Layers, TestTube2, GitCommit, AlertTriangle, Info } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

interface Finding {
  agent: string
  severity: 'error' | 'warning' | 'info'
  message: string
  file?: string | null
  line?: number | null
}

const agentIcons: Record<string, React.ElementType> = {
  security:     ShieldAlert,
  architecture: Layers,
  testing:      TestTube2,
  churn:        GitCommit,
  system:       AlertTriangle,
}

const severityConfig = {
  error:   { line: 'bg-red-500',    badge: 'badge-danger',   icon: 'text-red-400' },
  warning: { line: 'bg-amber-500',  badge: 'badge-warning',  icon: 'text-amber-400' },
  info:    { line: 'bg-sky-500',    badge: 'badge-info',     icon: 'text-sky-400' },
}

export function AgentFindings({ findings }: { findings: Finding[] }) {
  const [expanded, setExpanded] = useState<number | null>(null)

  if (!findings || findings.length === 0) {
    return (
      <div className="flex items-center gap-3 py-6 text-slate-500 text-sm">
        <Info className="w-4 h-4" />
        No agent findings for this run.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {findings.map((finding, i) => {
        const AgentIcon = agentIcons[finding.agent] ?? Info
        const config = severityConfig[finding.severity] ?? severityConfig.info
        const isOpen = expanded === i

        return (
          <motion.div
            key={i}
            className="relative overflow-hidden rounded-xl cursor-pointer"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            whileHover={{ background: 'rgba(255,255,255,0.04)' }}
            onClick={() => setExpanded(isOpen ? null : i)}
          >
            {/* Severity line */}
            <div className={clsx('severity-line', config.line)} />

            <div className="pl-5 pr-4 py-3 flex items-center gap-3">
              <div className={clsx('flex-shrink-0', config.icon)}>
                <AgentIcon className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={config.badge}>{finding.agent}</span>
                  <span className={config.badge}>{finding.severity}</span>
                  {finding.file && (
                    <span className="text-[11px] text-slate-500 font-mono truncate max-w-[200px]">
                      {finding.file.split('/').pop()}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-1">
                  {finding.message}
                </p>
              </div>

              <motion.div
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="flex-shrink-0"
              >
                <ChevronDown className="w-4 h-4 text-slate-600" />
              </motion.div>
            </div>

            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="pl-5 pr-4 pb-4 pt-1 border-t border-white/5">
                    <p className="text-sm text-slate-300 leading-relaxed">{finding.message}</p>
                    {finding.file && (
                      <div className="mt-2 flex items-center gap-2">
                        <code className="text-xs text-slate-400 bg-surface-900 px-2 py-1 rounded-md font-mono">
                          {finding.file}{finding.line ? `:${finding.line}` : ''}
                        </code>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )
      })}
    </div>
  )
}
