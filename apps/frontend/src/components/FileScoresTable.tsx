import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp, ChevronDown, AlertTriangle, Search, X } from 'lucide-react'
import { api } from '../lib/api'
import { withCache, invalidateCache } from '../lib/cache'
import type { FileHealthScore } from '@sentinel/types'
import clsx from 'clsx'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FilesResponse {
  files: FileHealthScore[]
  meta: { repositoryId: string; healthScoreId: string | null; runAt: string | null }
}

type SortKey = 'filePath' | 'cyclomaticComplexity' | 'cognitiveComplexity' | 'churnCount' | 'lineCoverage'

// ─── Sub-components ───────────────────────────────────────────────────────────

function ComplexityPill({ value }: { value: number }) {
  if (value > 15) return <span className="badge-danger">{value.toFixed(1)}</span>
  if (value > 5)  return <span className="badge-warning">{value.toFixed(1)}</span>
  return <span className="badge-success">{value.toFixed(1)}</span>
}

function CoverageMeter({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-600 text-xs">—</span>
  const color = value >= 80 ? '#34d399' : value >= 50 ? '#fbbf24' : '#f87171'
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <span className="text-xs text-slate-400 tabular-nums">{value.toFixed(0)}%</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FileScoresTable({ repositoryId }: { repositoryId: string }) {
  const [files, setFiles] = useState<FileHealthScore[]>([])
  const [meta, setMeta] = useState<FilesResponse['meta'] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('cyclomaticComplexity')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filter, setFilter] = useState('')
  const [onlyHotspots, setOnlyHotspots] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function fetchFiles() {
      setIsLoading(true)
      setError(null)
      try {
        // /api/graph/:id/files → proxied to orchestrator /repos/:id/files
        const data = await withCache<FilesResponse>(
          `files:${repositoryId}`,
          () => api.get<FilesResponse>(`/api/graph/${repositoryId}/files`).then(r => r.data),
          30_000,
        )
        if (!cancelled) {
          setFiles(data.files)
          setMeta(data.meta)
        }
      } catch {
        if (!cancelled) setError('Could not load file scores. Run an analysis first.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    fetchFiles()
    return () => { cancelled = true }
  }, [repositoryId])

  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        return prev
      }
      setSortDir('desc')
      return key
    })
  }, [])

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronDown className="w-3 h-3 opacity-20" />
    return sortDir === 'desc'
      ? <ChevronDown className="w-3 h-3 text-brand-400" />
      : <ChevronUp className="w-3 h-3 text-brand-400" />
  }

  const filtered = files
    .filter(f => {
      if (onlyHotspots && !f.isHotspot) return false
      if (filter && !f.filePath.toLowerCase().includes(filter.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      const av = (a[sortKey] as number | string | null) ?? 0
      const bv = (b[sortKey] as number | string | null) ?? 0
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv)
      }
      return sortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number)
    })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map(i => (
          <motion.div
            key={i}
            className="h-10 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.03)' }}
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.12 }}
          />
        ))}
      </div>
    )
  }

  if (error || files.length === 0) {
    return (
      <div className="text-center py-10 text-slate-500 text-sm">
        <p className="font-medium text-slate-400">{error ?? 'No per-file data yet.'}</p>
        <p className="text-xs text-slate-600 mt-1">Run an analysis to populate file-level metrics.</p>
      </div>
    )
  }

  const hotspotCount = files.filter(f => f.isHotspot).length
  const cols: { key: SortKey; label: string }[] = [
    { key: 'cyclomaticComplexity', label: 'Cyclomatic' },
    { key: 'cognitiveComplexity',  label: 'Cognitive' },
    { key: 'churnCount',           label: 'Churn' },
    { key: 'lineCoverage',         label: 'Coverage' },
  ]

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-slate-500 flex-1">
          {meta?.runAt && <span>Last run: {new Date(meta.runAt).toLocaleString()}</span>}
          <span>·</span>
          <span>{files.length} files</span>
          {hotspotCount > 0 && (
            <>
              <span>·</span>
              <span className="text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {hotspotCount} hotspots
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Hotspot filter toggle */}
          {hotspotCount > 0 && (
            <motion.button
              onClick={() => setOnlyHotspots(p => !p)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                onlyHotspots
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'bg-white/5 text-slate-400 border-white/10 hover:border-white/20'
              )}
              whileTap={{ scale: 0.96 }}
            >
              <AlertTriangle className="w-3 h-3" />
              Hotspots only
            </motion.button>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
            <input
              className="input pl-8 pr-7 w-52 py-1.5 text-xs"
              placeholder="Filter by path..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            {filter && (
              <button
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
                onClick={() => setFilter('')}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="w-full text-xs text-left">
          <thead>
            <tr style={{ background: 'rgba(15,23,42,0.8)' }}>
              <th className="px-3 py-3 w-8" />
              <th
                className="px-3 py-3 cursor-pointer hover:text-slate-200 transition-colors"
                onClick={() => handleSort('filePath')}
              >
                <span className="flex items-center gap-1 text-slate-500 uppercase tracking-wide text-[10px] font-semibold">
                  File <SortIcon k="filePath" />
                </span>
              </th>
              {cols.map(col => (
                <th
                  key={col.key}
                  className="px-3 py-3 cursor-pointer hover:text-slate-200 transition-colors whitespace-nowrap"
                  onClick={() => handleSort(col.key)}
                >
                  <span className="flex items-center gap-1 text-slate-500 uppercase tracking-wide text-[10px] font-semibold">
                    {col.label} <SortIcon k={col.key} />
                  </span>
                </th>
              ))}
              <th className="px-3 py-3">
                <span className="text-slate-500 uppercase tracking-wide text-[10px] font-semibold">Authors</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {filtered.map((file, i) => (
                <motion.tr
                  key={file.id}
                  className={clsx(
                    'border-t border-white/5 transition-colors',
                    file.isHotspot
                      ? 'bg-amber-500/5 hover:bg-amber-500/8'
                      : 'hover:bg-white/3'
                  )}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                >
                  {/* Hotspot indicator */}
                  <td className="px-3 py-3">
                    {file.isHotspot && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400 }}
                      >
                        <AlertTriangle
                          className="w-3.5 h-3.5 text-amber-400"
                          title={file.hotspotReasons.join(', ')}
                        />
                      </motion.div>
                    )}
                  </td>

                  {/* File path */}
                  <td className="px-3 py-3 max-w-xs">
                    <div className="font-mono text-slate-300 truncate" title={file.filePath}>
                      {/* Dim the directory portion, highlight the filename */}
                      <span className="text-slate-600">
                        {file.filePath.includes('/')
                          ? file.filePath.substring(0, file.filePath.lastIndexOf('/') + 1)
                          : ''}
                      </span>
                      <span className="text-slate-200">
                        {file.filePath.split('/').pop()}
                      </span>
                    </div>
                    {file.language && (
                      <span className="badge-neutral mt-0.5">{file.language}</span>
                    )}
                  </td>

                  <td className="px-3 py-3"><ComplexityPill value={file.cyclomaticComplexity} /></td>
                  <td className="px-3 py-3">
                    <span className={clsx(
                      'badge',
                      file.cognitiveComplexity > 20 ? 'badge-danger' :
                      file.cognitiveComplexity > 10 ? 'badge-warning' : 'badge-success'
                    )}>
                      {file.cognitiveComplexity.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-300 tabular-nums">{file.churnCount}</td>
                  <td className="px-3 py-3"><CoverageMeter value={file.lineCoverage} /></td>
                  <td className="px-3 py-3 text-slate-500 tabular-nums">{file.authorCount}</td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-8 text-slate-600 text-xs">
            No files match your filter.
          </div>
        )}
      </div>

      <p className="mt-2 text-[11px] text-slate-600">
        Showing {filtered.length} of {files.length} files
      </p>
    </div>
  )
}
