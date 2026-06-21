import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Play, GitBranch, Github, Clock, Network, FileCode2, Cpu, AlertTriangle } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import clsx from 'clsx'
import { api } from '../lib/api'
import { withCache, invalidateCache } from '../lib/cache'
import { JobTracker } from '../components/JobTracker'
import { DependencyGraph } from '../components/DependencyGraph'
import { FileScoresTable } from '../components/FileScoresTable'
import { ScoreRing } from '../components/ScoreRing'
import { AgentFindings } from '../components/AgentFindings'

type Tab = 'overview' | 'graph' | 'files' | 'findings'

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',  label: 'Overview',           icon: Activity },
  { id: 'graph',     label: 'Dependency Graph',   icon: Network },
  { id: 'files',     label: 'File Scores',         icon: FileCode2 },
  { id: 'findings',  label: 'AI Findings',         icon: Cpu },
]

const statVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  }),
}

export function RepoDashboard() {
  const { id } = useParams<{ id: string }>()
  const [repo, setRepo] = useState<any>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [isTriggering, setIsTriggering] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const fetchRepo = useCallback(async (bust = false) => {
    if (!id) return
    if (bust) invalidateCache(`repo:${id}`)
    try {
      const data = await withCache(
        `repo:${id}`,
        () => api.get(`/api/repos/${id}`).then(r => r.data),
        30_000,
      )
      setRepo(data)
    } catch {}
  }, [id])

  useEffect(() => { fetchRepo(false) }, [fetchRepo])

  const triggerAnalysis = async () => {
    if (!id || isTriggering) return
    setIsTriggering(true)
    try {
      const { data } = await api.post('/api/jobs', { repositoryId: id })
      setActiveJobId(data.jobId)
    } catch {}
    setIsTriggering(false)
  }

  if (!repo) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map(i => (
          <motion.div
            key={i}
            className="rounded-2xl"
            style={{ height: i === 1 ? 80 : 200, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    )
  }

  const healthData = repo.healthScores?.map((h: any) => ({
    date: new Date(h.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    score: Math.round(h.overallScore),
  })).reverse() ?? []

  const latestScore = repo.healthScores?.[0]
  const findings = latestScore?.agentFindings ?? []

  const subMetrics = [
    { label: 'Complexity', value: latestScore?.complexityScore, key: 'c' },
    { label: 'Churn',      value: latestScore?.churnScore,      key: 'ch' },
    { label: 'Coupling',   value: latestScore?.couplingScore,   key: 'co' },
    { label: 'Coverage',   value: latestScore?.testCoverageScore, key: 't' },
  ]

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <motion.div
        className="flex flex-col sm:flex-row sm:items-start justify-between gap-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-black text-slate-100 tracking-tight">{repo.name}</h1>
            <span className={repo.isPrivate ? 'badge-neutral' : 'badge-info'}>
              {repo.isPrivate ? 'Private' : 'Public'}
            </span>
            {repo.isActive && <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="pulse-dot" />
              Active
            </span>}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><Github className="w-3.5 h-3.5" />{repo.fullName}</span>
            <span className="flex items-center gap-1.5"><GitBranch className="w-3.5 h-3.5" />{repo.defaultBranch}</span>
          </div>
        </div>
        <motion.button
          onClick={triggerAnalysis}
          disabled={isTriggering || !!activeJobId}
          className="btn-primary flex-shrink-0"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          {isTriggering
            ? <Activity className="w-4 h-4 animate-spin" />
            : <Play className="w-4 h-4" />
          }
          Run Analysis
        </motion.button>
      </motion.div>

      {/* ── Live Job Tracker ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {activeJobId && (
          <motion.div
            key="tracker"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35 }}
          >
            <JobTracker
              jobId={activeJobId}
              onComplete={() => {
                setActiveJobId(null)
                // Invalidate all related cache entries so fresh data loads
                invalidateCache(`repo:${id}`)
                invalidateCache(`graph:${id}`)
                invalidateCache(`files:${id}`)
                fetchRepo(true)
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="relative flex items-center gap-1 border-b border-white/6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === tab.id ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.id === 'findings' && findings.length > 0 && (
              <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25">
                {findings.length}
              </span>
            )}
            {activeTab === tab.id && (
              <motion.div
                layoutId="tab-underline"
                className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-400 to-transparent"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Score + breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              {/* Score ring */}
              <div className="card lg:col-span-1 flex flex-col items-center justify-center py-8">
                <ScoreRing
                  score={latestScore?.overallScore ?? null}
                  size={148}
                  strokeWidth={9}
                  label="Overall Health"
                />
              </div>

              {/* Sub-metric tiles */}
              <div className="lg:col-span-2 grid grid-cols-2 gap-3">
                {subMetrics.map((m, i) => (
                  <motion.div
                    key={m.key}
                    className="stat-tile"
                    custom={i}
                    variants={statVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    <p className="text-xs text-slate-500 mb-2">{m.label}</p>
                    <ScoreRing
                      score={m.value ?? null}
                      size={72}
                      strokeWidth={5}
                      label=""
                      showSubLabel={false}
                    />
                  </motion.div>
                ))}
              </div>

              {/* Debt + hotspots */}
              <div className="lg:col-span-2 flex flex-col gap-3">
                <motion.div
                  className="stat-tile flex-1"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <p className="text-xs text-slate-500 mb-1">Technical Debt</p>
                  <p className="text-3xl font-black text-slate-100">
                    {latestScore ? `${Math.round(latestScore.debtMinutes / 60)}h` : '--'}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">estimated remediation time</p>
                </motion.div>
                <motion.div
                  className="stat-tile flex-1"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.28 }}
                >
                  <p className="text-xs text-slate-500 mb-1">Hotspot Files</p>
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-black text-slate-100">{latestScore?.hotspotCount ?? '--'}</p>
                    {latestScore?.hotspotCount > 0 && (
                      <AlertTriangle className="w-4 h-4 text-amber-400 mb-1" />
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">high churn × high complexity</p>
                </motion.div>
              </div>
            </div>

            {/* Trendline */}
            <motion.div
              className="card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <h3 className="text-sm font-semibold text-slate-300 mb-5">Health Score Trend</h3>
              <div className="h-52">
                {healthData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={healthData} margin={{ left: -24, right: 0 }}>
                      <defs>
                        <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="#6366f1" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{
                          background: '#0f172a',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 12,
                          fontSize: 12,
                          color: '#e2e8f0',
                        }}
                        cursor={{ stroke: 'rgba(99,102,241,0.3)', strokeWidth: 1, strokeDasharray: '4' }}
                      />
                      <Area
                        type="monotone" dataKey="score"
                        stroke="#6366f1" strokeWidth={2.5}
                        fill="url(#scoreGrad)" dot={false}
                        activeDot={{ r: 4, fill: '#818cf8', stroke: '#312e81' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-slate-600 text-sm">Run at least 2 analyses to see the trend.</p>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Recent jobs */}
            <motion.div
              className="card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Recent Pipeline Runs</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-600 uppercase text-[10px] tracking-wide">
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2">Trigger</th>
                      <th className="text-left px-3 py-2">Commit</th>
                      <th className="text-left px-3 py-2">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(repo.jobs ?? []).map((job: any, i: number) => (
                      <motion.tr
                        key={job.id}
                        className="border-t border-white/5 hover:bg-white/3 transition-colors"
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.25 + i * 0.04 }}
                      >
                        <td className="px-3 py-3">
                          <span className={clsx(
                            'badge',
                            job.status === 'completed' ? 'badge-success' :
                            job.status === 'failed' ? 'badge-danger' : 'badge-info'
                          )}>
                            {job.status === 'processing' && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse mr-1" />}
                            {job.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-400 capitalize">{job.trigger}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <GitBranch className="w-3 h-3 text-slate-600" />
                            {job.branch ?? '—'}
                            {job.commitSha && (
                              <code className="ml-1 px-1.5 py-0.5 bg-surface-900 rounded text-slate-500 font-mono text-[10px]">
                                {job.commitSha.slice(0, 7)}
                              </code>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-500 flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {new Date(job.createdAt).toLocaleString()}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
                {(!repo.jobs || repo.jobs.length === 0) && (
                  <p className="text-center py-8 text-slate-600 text-xs">No pipeline runs yet.</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {activeTab === 'graph' && id && (
          <motion.div
            key="graph"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="card"
          >
            <div className="flex items-center gap-2 mb-4">
              <Network className="w-4 h-4 text-brand-400" />
              <h3 className="text-sm font-semibold text-slate-200">Module Dependency Graph</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Node colour: <span className="text-emerald-400">green</span> = low complexity,
              <span className="text-amber-400"> amber</span> = medium,
              <span className="text-orange-400"> orange</span> = high,
              <span className="text-red-400"> red</span> = hotspot
            </p>
            <DependencyGraph repositoryId={id} />
          </motion.div>
        )}

        {activeTab === 'files' && id && (
          <motion.div
            key="files"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="card"
          >
            <div className="flex items-center gap-2 mb-4">
              <FileCode2 className="w-4 h-4 text-brand-400" />
              <h3 className="text-sm font-semibold text-slate-200">Per-File Health Scores</h3>
            </div>
            <FileScoresTable repositoryId={id} />
          </motion.div>
        )}

        {activeTab === 'findings' && (
          <motion.div
            key="findings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="card"
          >
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-4 h-4 text-brand-400" />
              <h3 className="text-sm font-semibold text-slate-200">AI Agent Findings</h3>
              <span className="ml-auto text-xs text-slate-500">{findings.length} findings</span>
            </div>
            <AgentFindings findings={findings} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
