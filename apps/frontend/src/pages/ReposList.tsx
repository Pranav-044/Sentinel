import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Github, ArrowRight, FolderGit2 } from 'lucide-react'
import { api } from '../lib/api'
import type { Repository } from '@sentinel/types'

export function ReposList() {
  const [repos, setRepos] = useState<Repository[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // In a real app, we'd list orgs first, then fetch repos. 
    // For now, we assume the user has onboarded their org and we fetch all tracked repos.
    // Let's call /orgs to get orgs, then /orgs/:id/repos. Since we don't have the full org hierarchy mapped in UI yet,
    // we'll simulate fetching the user's active tracked repos.
    // We didn't build a global GET /repos endpoint, so we'll fetch orgs, and then their repos.
    
    async function fetchRepos() {
      try {
        const { data: orgs } = await api.get<{ id: string }[]>('/orgs')
        if (orgs.length > 0) {
          const { data: orgDetails } = await api.get<{ repositories: Repository[] }>(`/orgs/${orgs[0].id}`)
          setRepos(orgDetails.repositories)
        }
      } catch (err) {
        console.error('Failed to fetch repos', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchRepos()
  }, [])

  if (isLoading) {
    return <div className="animate-pulse space-y-4">
      {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white/5 rounded-xl" />)}
    </div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Repositories</h1>
          <p className="text-sm text-slate-400 mt-1">Manage and track your codebase health.</p>
        </div>
        <button className="btn-primary">
          <Plus className="w-4 h-4" />
          Add Repository
        </button>
      </div>

      {repos.length === 0 ? (
        <div className="text-center py-16 card border-dashed">
          <FolderGit2 className="mx-auto h-12 w-12 text-slate-500 mb-4" />
          <h3 className="text-sm font-medium text-slate-200">No repositories</h3>
          <p className="mt-1 text-sm text-slate-400">Get started by importing a repository from your GitHub organization.</p>
          <div className="mt-6">
            <button className="btn-secondary">
              <Github className="w-4 h-4" />
              Import from GitHub
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {repos.map(repo => (
            <Link key={repo.id} to={`/dashboard/repos/${repo.id}`} className="group card glass-hover relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-200 flex items-center">
                    <Github className="w-4 h-4 mr-2 text-slate-400" />
                    {repo.name}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1 truncate" title={repo.fullName}>{repo.fullName}</p>
                </div>
                <div className={`w-2 h-2 rounded-full ${repo.isActive ? 'bg-emerald-400 glow' : 'bg-slate-600'}`} />
              </div>
              
              {/* Fake a sparkline/health preview for the card */}
              <div className="mt-6 flex items-end justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Health Score</p>
                  <p className="text-2xl font-bold text-brand-400">--</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-brand-500 group-hover:text-white transition-colors">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
