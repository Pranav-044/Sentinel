import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Activity, Play, GitBranch, Github, Clock } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../lib/api'
import { JobTracker } from '../components/JobTracker'

export function RepoDashboard() {
  const { id } = useParams<{ id: string }>()
  const [repo, setRepo] = useState<any>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [isTriggering, setIsTriggering] = useState(false)

  const fetchRepo = async () => {
    try {
      const { data } = await api.get(`/repos/${id}`)
      setRepo(data)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (id) fetchRepo()
  }, [id])

  const triggerAnalysis = async () => {
    if (!id || isTriggering) return
    setIsTriggering(true)
    try {
      const { data } = await api.post('/jobs', { repositoryId: id })
      setActiveJobId(data.jobId)
    } catch (err) {
      console.error(err)
    } finally {
      setIsTriggering(false)
    }
  }

  if (!repo) return <div className="animate-pulse h-64 card" />

  const healthData = repo.healthScores?.map((h: any) => ({
    date: new Date(h.createdAt).toLocaleDateString(),
    score: h.overallScore,
  })).reverse() || []

  const latestScore = repo.healthScores?.[0]

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-100">{repo.name}</h1>
            <span className="badge-neutral">{repo.isPrivate ? 'Private' : 'Public'}</span>
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
            <span className="flex items-center"><Github className="w-4 h-4 mr-1.5" /> {repo.fullName}</span>
            <span className="flex items-center"><GitBranch className="w-4 h-4 mr-1.5" /> {repo.defaultBranch}</span>
          </div>
        </div>
        
        <button 
          onClick={triggerAnalysis} 
          disabled={isTriggering || !!activeJobId}
          className="btn-primary"
        >
          {isTriggering ? <Activity className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run Analysis
        </button>
      </div>

      {/* Active Job Tracker */}
      {activeJobId && (
        <div className="animate-slide-up">
          <JobTracker 
            jobId={activeJobId} 
            onComplete={() => {
              setActiveJobId(null)
              fetchRepo() // refresh data to show new health score
            }} 
          />
        </div>
      )}

      {/* Health Score Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card md:col-span-1 flex flex-col justify-center items-center text-center">
          <h3 className="text-sm font-medium text-slate-400 mb-4">Overall Codebase Health</h3>
          <div className="score-ring mb-2">
            {/* Simple CSS ring placeholder */}
            <div className="w-32 h-32 rounded-full border-8 border-brand-500/20 flex items-center justify-center relative">
              <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent"
                  className="text-brand-500 transition-all duration-1000 ease-out"
                  strokeDasharray={`${(latestScore?.overallScore || 0) * 3.51} 351`} />
              </svg>
              <span className="text-4xl font-bold text-slate-100">{latestScore?.overallScore?.toFixed(0) || '--'}</span>
            </div>
          </div>
          <p className="text-sm text-slate-500">Out of 100</p>
        </div>

        {/* Trendline Chart */}
        <div className="card md:col-span-3">
          <h3 className="text-sm font-medium text-slate-400 mb-6">Health Trend (Last 30 Scans)</h3>
          <div className="h-48 w-full">
            {healthData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={healthData}>
                  <defs>
                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="date" stroke="#ffffff40" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#ffffff40" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #ffffff10', borderRadius: '8px' }}
                    itemStyle={{ color: '#e2e8f0' }}
                  />
                  <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                No analysis data available yet. Run an analysis to generate the first health score.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Jobs History */}
      <div className="card">
        <h3 className="text-sm font-medium text-slate-400 mb-4">Recent Pipeline Runs</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-surface-900/50">
              <tr>
                <th className="px-4 py-3 rounded-l-lg">Status</th>
                <th className="px-4 py-3">Trigger</th>
                <th className="px-4 py-3">Commit / Branch</th>
                <th className="px-4 py-3 rounded-r-lg">Time</th>
              </tr>
            </thead>
            <tbody>
              {repo.jobs?.map((job: any) => (
                <tr key={job.id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`badge ${
                      job.status === 'completed' ? 'badge-success' :
                      job.status === 'failed' ? 'badge-danger' :
                      'badge-info animate-pulse'
                    }`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 capitalize">{job.trigger}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center text-slate-300">
                      <GitBranch className="w-3 h-3 mr-1.5 text-slate-500" /> {job.branch}
                      {job.commitSha && <span className="ml-2 px-1.5 py-0.5 bg-surface-800 rounded text-xs text-slate-400 font-mono">{job.commitSha.slice(0, 7)}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 flex items-center">
                    <Clock className="w-3 h-3 mr-1.5" />
                    {new Date(job.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!repo.jobs || repo.jobs.length === 0) && (
            <div className="text-center py-6 text-slate-500 text-sm">No jobs executed yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}
