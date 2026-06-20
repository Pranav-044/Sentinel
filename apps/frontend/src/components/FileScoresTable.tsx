import { useEffect, useState } from 'react'
import { ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'
import clsx from 'clsx'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileScore {
  id: string
  filePath: string
  language: string | null
  cyclomaticComplexity: number
  cognitiveComplexity: number
  churnCount: number
  authorCount: number
  lineCoverage: number | null
  branchCoverage: number | null
  isHotspot: boolean
  hotspotReasons: string[]
}

interface FilesResponse {
  files: FileScore[]
  meta: { repositoryId: string; healthScoreId: string | null; runAt: string | null }
}

type SortKey = keyof Pick<FileScore,
  'filePath' | 'cyclomaticComplexity' | 'cognitiveComplexity' | 'churnCount' | 'lineCoverage'
>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function complexityBadge(value: number) {
  if (value > 15) return <span className="badge-danger">{value.toFixed(1)}</span>
  if (value > 5) return <span className="badge-warning">{value.toFixed(1)}</span>
  return <span className="badge-success">{value.toFixed(1)}</span>
}

function coverageBar(value: number | null) {
  if (value === null) return <span className="text-slate-600 text-xs">n/a</span>
  const color = value >= 80 ? 'bg-emerald-500' : value >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-surface-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-slate-400">{value.toFixed(0)}%</span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FileScoresTable({ repositoryId }: { repositoryId: string }) {
  const [files, setFiles] = useState<FileScore[]>([])
  const [meta, setMeta] = useState<FilesResponse['meta'] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('cyclomaticComplexity')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    async function fetchFiles() {
      setIsLoading(true)
      try {
        const { data } = await api.get<FilesResponse>(`/repos/${repositoryId}/files`)
        setFiles(data.files)
        setMeta(data.meta)
      } catch (err) {
        console.error('Failed to fetch file scores', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchFiles()
  }, [repositoryId])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const SortIcon = ({ k }: { k: SortKey }) => sortKey !== k ? null
    : sortDir === 'desc' ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronUp className="w-3 h-3 ml-1" />

  const sorted = [...files]
    .filter(f => f.filePath.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => {
      const av = a[sortKey] ?? 0
      const bv = b[sortKey] ?? 0
      return sortDir === 'desc'
        ? (bv as number) - (av as number)
        : (av as number) - (bv as number)
    })

  if (isLoading) {
    return <div className="animate-pulse h-48 bg-white/5 rounded-xl" />
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">
        No per-file data yet. Run an analysis to populate file-level metrics.
      </div>
    )
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: 'cyclomaticComplexity', label: 'Complexity' },
    { key: 'cognitiveComplexity', label: 'Cognitive' },
    { key: 'churnCount', label: 'Churn (90d)' },
    { key: 'lineCoverage', label: 'Line Coverage' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {meta?.runAt && <span>Last run: {new Date(meta.runAt).toLocaleString()}</span>}
          <span>·</span>
          <span>{files.length} files</span>
        </div>
        <input
          className="input w-64"
          placeholder="Filter files..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-surface-900">
            <tr>
              <th className="px-4 py-3 w-12">&nbsp;</th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-slate-300"
                onClick={() => handleSort('filePath')}
              >
                <span className="flex items-center">File<SortIcon k="filePath" /></span>
              </th>
              {columns.map(col => (
                <th
                  key={col.key}
                  className="px-4 py-3 cursor-pointer hover:text-slate-300 whitespace-nowrap"
                  onClick={() => handleSort(col.key)}
                >
                  <span className="flex items-center">{col.label}<SortIcon k={col.key} /></span>
                </th>
              ))}
              <th className="px-4 py-3">Churn Authors</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(file => (
              <tr
                key={file.id}
                className={clsx(
                  'border-t border-white/5 last:border-0 transition-colors',
                  file.isHotspot ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-white/5'
                )}
              >
                <td className="px-4 py-3">
                  {file.isHotspot && (
                    <AlertTriangle
                      className="w-4 h-4 text-red-400"
                      title={file.hotspotReasons.join(', ')}
                    />
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-mono text-xs text-slate-300 truncate max-w-xs" title={file.filePath}>
                    {file.filePath}
                  </div>
                  {file.language && (
                    <span className="badge-neutral mt-0.5">{file.language}</span>
                  )}
                </td>
                <td className="px-4 py-3">{complexityBadge(file.cyclomaticComplexity)}</td>
                <td className="px-4 py-3">
                  <span className={clsx(
                    'badge',
                    file.cognitiveComplexity > 20 ? 'badge-danger' :
                    file.cognitiveComplexity > 10 ? 'badge-warning' : 'badge-success'
                  )}>
                    {file.cognitiveComplexity.toFixed(1)}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-300">{file.churnCount}</td>
                <td className="px-4 py-3">{coverageBar(file.lineCoverage)}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{file.authorCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
