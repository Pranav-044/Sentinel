import { useEffect, useState, useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import { withCache } from '../lib/cache'
import type { GraphData, GraphNode, GraphEdge } from '@sentinel/types'

// ─── Node colour by complexity ─────────────────────────────────────────────────

function complexityColor(complexity: number, isHotspot: boolean) {
  if (isHotspot)      return { bg: '#ef444420', border: '#ef4444' }  // red
  if (complexity > 15) return { bg: '#f9731620', border: '#f97316' }  // orange
  if (complexity > 5)  return { bg: '#eab30820', border: '#eab308' }  // yellow
  return                      { bg: '#22c55e20', border: '#22c55e' }  // green
}

// ─── Grid layout (simple, no dependency needed) ───────────────────────────────

function layoutNodes(apiNodes: GraphNode[]): Node[] {
  const cols = Math.max(3, Math.ceil(Math.sqrt(apiNodes.length)))
  return apiNodes.map((n, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const { bg, border } = complexityColor(n.complexity, n.isHotspot)
    const shortLabel = n.label.split('/').pop() ?? n.label

    return {
      id: n.id,
      position: { x: col * 220, y: row * 110 },
      data: {
        label: (
          <div style={{ maxWidth: 160, overflow: 'hidden' }}>
            <span style={{ fontSize: 9, color: '#94a3b8', display: 'block', marginBottom: 2 }}>
              {n.language}
            </span>
            <strong
              style={{ fontSize: 11, color: '#e2e8f0', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={n.label}
            >
              {shortLabel}
            </strong>
            <span style={{ fontSize: 9, color: '#64748b' }}>cc: {n.complexity.toFixed(1)}</span>
          </div>
        ),
      },
      style: {
        background: bg,
        border: `1.5px solid ${border}`,
        borderRadius: 10,
        padding: '6px 10px',
        color: '#e2e8f0',
        fontSize: 11,
        width: 180,
        minHeight: 52,
      },
    }
  })
}

function layoutEdges(apiEdges: GraphEdge[]): Edge[] {
  return apiEdges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: false,
    style: { stroke: '#6366f140', strokeWidth: e.weight > 3 ? 2 : 1 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1', width: 12, height: 12 },
  }))
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DependencyGraph({ repositoryId }: { repositoryId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [meta, setMeta] = useState<GraphData['meta'] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEmpty, setIsEmpty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge(params, eds)),
    [setEdges]
  )

  useEffect(() => {
    let cancelled = false
    async function fetchGraph() {
      setIsLoading(true)
      setError(null)
      try {
        // Uses /api/graph/:id/graph → proxied to orchestrator /repos/:id/graph
        const data = await withCache<GraphData>(
          `graph:${repositoryId}`,
          () => api.get<GraphData>(`/api/graph/${repositoryId}/graph`).then(r => r.data),
          60_000, // graph data is expensive to compute — cache 60s
        )
        if (cancelled) return
        if (!data.nodes.length) {
          setIsEmpty(true)
        } else {
          setNodes(layoutNodes(data.nodes))
          setEdges(layoutEdges(data.edges))
          setMeta(data.meta)
        }
      } catch (err: any) {
        if (!cancelled) setError('Graph data unavailable. Run an analysis first.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    fetchGraph()
    return () => { cancelled = true }
  }, [repositoryId])

  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <motion.div
            className="w-8 h-8 rounded-full border-2 border-brand-400 border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <p className="text-sm text-slate-500">Loading dependency graph...</p>
        </div>
      </div>
    )
  }

  if (error || isEmpty) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
        <p className="font-medium text-slate-400">{error ?? 'No graph data yet.'}</p>
        <p className="text-slate-600 text-xs">Run an analysis to generate the dependency graph.</p>
      </div>
    )
  }

  const legend = [
    { color: '#22c55e', label: 'Low (cc ≤ 5)' },
    { color: '#eab308', label: 'Medium (cc 5–15)' },
    { color: '#f97316', label: 'High (cc > 15)' },
    { color: '#ef4444', label: 'Hotspot' },
  ]

  return (
    <div>
      {/* Legend + meta */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-slate-500">
        {meta && (
          <>
            <span>{meta.nodeCount} modules · {meta.edgeCount} edges</span>
            <span>·</span>
            <span>Generated {new Date(meta.generatedAt).toLocaleString()}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-3 flex-wrap">
          {legend.map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0" style={{ background: color }} />
              <span>{label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Graph canvas */}
      <div
        className="rounded-xl overflow-hidden border border-white/8"
        style={{ height: 520, background: 'rgba(8,13,26,0.8)' }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          style={{ background: 'transparent' }}
          defaultEdgeOptions={{ animated: false }}
        >
          <Background
            color="rgba(99,102,241,0.06)"
            gap={32}
            size={1}
            style={{ background: 'transparent' }}
          />
          <Controls showInteractive={false} />
          <MiniMap
            nodeStrokeWidth={2}
            style={{
              background: 'rgba(8,13,26,0.9)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
            }}
            nodeColor={n => {
              const b = n.style?.border as string ?? ''
              return b.replace('1.5px solid ', '') || '#6366f1'
            }}
          />
        </ReactFlow>
      </div>
    </div>
  )
}
