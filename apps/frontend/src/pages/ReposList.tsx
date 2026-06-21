import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Github, ArrowRight, FolderGit2, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { ScoreRing } from '../components/ScoreRing'

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.08,
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
}

export function ReposList() {
  const [repos, setRepos] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchRepos() {
      try {
        const { data: orgs } = await api.get<{ id: string }[]>('/api/orgs')
        if (orgs.length > 0) {
          const { data: orgDetails } = await api.get<{ repositories: any[] }>(`/api/orgs/${orgs[0].id}`)
          setRepos(orgDetails.repositories ?? [])
        }
      } catch {
        setRepos([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchRepos()
  }, [])

  return (
    <div>
      {/* Page header */}
      <motion.div
        className="flex items-center justify-between mb-8"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            Repositories
            <Sparkles className="w-5 h-5 text-brand-400 opacity-70" />
          </h1>
          <p className="text-sm text-slate-500 mt-1">Track, analyse, and improve your codebase health.</p>
        </div>
        <motion.button
          className="btn-primary"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <Plus className="w-4 h-4" />
          Add Repository
        </motion.button>
      </motion.div>

      {isLoading ? (
        // Skeleton
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => (
            <motion.div
              key={i}
              className="rounded-2xl h-44"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              animate={{ opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      ) : repos.length === 0 ? (
        <motion.div
          className="card text-center py-16 border-dashed"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <FolderGit2 className="mx-auto h-10 w-10 text-slate-600 mb-4" />
          <h3 className="text-sm font-semibold text-slate-300">No repositories yet</h3>
          <p className="mt-1 text-sm text-slate-500">Import a repository from GitHub to get started.</p>
          <button className="btn-secondary mt-5">
            <Github className="w-4 h-4" />
            Import from GitHub
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {repos.map((repo, i) => {
            const latestScore = repo.healthScores?.[0]
            return (
              <motion.div
                key={repo.id}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
              >
                <Link to={`/dashboard/repos/${repo.id}`}>
                  <motion.div
                    className="card group cursor-pointer h-full relative overflow-hidden"
                    whileHover={{ y: -3, boxShadow: '0 8px 40px rgba(99,102,241,0.18)' }}
                    whileTap={{ scale: 0.99 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    {/* Hover gradient overlay */}
                    <motion.div
                      className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                      style={{
                        background: 'radial-gradient(circle at top right, rgba(99,102,241,0.08), transparent 60%)',
                      }}
                    />

                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Github className="w-4 h-4 text-slate-500 flex-shrink-0" />
                          <h3 className="text-sm font-bold text-slate-200 truncate">{repo.name}</h3>
                        </div>
                        <p className="text-xs text-slate-500 truncate">{repo.fullName}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {repo.isActive && (
                          <div className="pulse-dot" />
                        )}
                        <span className={repo.isPrivate ? 'badge-neutral' : 'badge-info'}>
                          {repo.isPrivate ? 'Private' : 'Public'}
                        </span>
                      </div>
                    </div>

                    {latestScore ? (
                      <div className="flex items-center gap-4">
                        <ScoreRing
                          score={latestScore.overallScore}
                          size={72}
                          strokeWidth={5}
                          label=""
                          showSubLabel={false}
                        />
                        <div className="flex-1 space-y-2">
                          {[
                            { label: 'Complexity', value: latestScore.complexityScore },
                            { label: 'Churn',      value: latestScore.churnScore },
                            { label: 'Coverage',   value: latestScore.testCoverageScore },
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <div className="flex items-center justify-between text-[11px] mb-0.5">
                                <span className="text-slate-500">{label}</span>
                                <span className="text-slate-400 font-medium">{value?.toFixed(0) ?? '--'}</span>
                              </div>
                              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{
                                    background: value >= 75 ? '#34d399' : value >= 50 ? '#fbbf24' : '#f87171',
                                  }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${value ?? 0}%` }}
                                  transition={{ duration: 1, delay: 0.3 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-slate-600">No analysis yet</p>
                        <span className="badge-neutral">Run analysis</span>
                      </div>
                    )}

                    {/* Arrow */}
                    <motion.div
                      className="absolute bottom-4 right-4 w-7 h-7 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-brand-400" />
                    </motion.div>
                  </motion.div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
