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
import { api } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiNode {
  id: string
  label: string
  language: string
  complexity: number
  isHotspot: boolean
}

interface ApiEdge {
  id: string
  source: string
  target: string
  weight: number
}

interface GraphData {
  nodes: ApiNode[]
  edges: ApiEdge[]
  meta: { nodeCount: number; edgeCount: number; generatedAt: string }
}

// ─── Node colour by complexity ─────────────────────────────────────────────────
// green < 5 | amber 5-15 | red > 15

function complexityColor(complexity: number, isHotspot: boolean): string {
  if (isHotspot) return '#ef4444'  // red-500
  if (complexity > 15) return '#f97316'  // orange-500
  if (complexity > 5) return '#eab308'   // yellow-500
  return '#22c55e'                        // green-500
}

// ─── Layout algorithm (simple dagre-style horizontal tree fallback) ────────────
// We use a simple circular / grid layout since dagre is not bundled with reactflow.
function layoutNodes(apiNodes: ApiNode[]): Node[] {
  const cols = Math.ceil(Math.sqrt(apiNodes.length))
  return apiNodes.map((n, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const color = complexityColor(n.complexity, n.isHotspot)
    return {
      id: n.id,
      position: { x: col * 200, y: row * 100 },
      data: {
        label: (
          <div title={n.label} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>{n.language}</span>
            <br />
            <strong style={{ fontSize: 12 }}>{n.label.split('/').pop()}</strong>
          </div>
        ),
      },
      style: {
        background: `${color}22`,
        border: `2px solid ${color}`,
        borderRadius: 8,
        color: '#e2e8f0',
        fontSize: 12,
        width: 180,
      },
    }
  })
}

function layoutEdges(apiEdges: ApiEdge[]): Edge[] {
  return apiEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: false,
    style: { stroke: '#6366f160', strokeWidth: e.weight > 3 ? 2 : 1 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
  }))
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DependencyGraph({ repositoryId }: { repositoryId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [meta, setMeta] = useState<GraphData['meta'] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEmpty, setIsEmpty] = useState(false)

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  useEffect(() => {
    async function fetchGraph() {
      setIsLoading(true)
      try {
        const { data } = await api.get<GraphData>(`/repos/${repositoryId}/graph`)
        if (data.nodes.length === 0) {
          setIsEmpty(true)
        } else {
          setNodes(layoutNodes(data.nodes))
          setEdges(layoutEdges(data.edges))
          setMeta(data.meta)
        }
      } catch (err) {
        console.error('Failed to fetch dependency graph', err)
        setIsEmpty(true)
      } finally {
        setIsLoading(false)
      }
    }
    fetchGraph()
  }, [repositoryId])

  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center text-slate-400 animate-pulse">
        Loading dependency graph...
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-slate-500 text-sm">
        <p className="font-medium">No graph data available yet.</p>
        <p className="mt-1 text-slate-600">Run an analysis to generate the dependency graph.</p>
      </div>
    )
  }

  return (
    <div>
      {meta && (
        <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
          <span>{meta.nodeCount} modules</span>
          <span>·</span>
          <span>{meta.edgeCount} edges</span>
          <span>·</span>
          <span>Generated {new Date(meta.generatedAt).toLocaleString()}</span>
          {/* Legend */}
          <div className="ml-auto flex items-center gap-3">
            {[
              { color: '#22c55e', label: 'Low complexity' },
              { color: '#eab308', label: 'Medium (>5)' },
              { color: '#f97316', label: 'High (>15)' },
              { color: '#ef4444', label: 'Hotspot' },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="h-[500px] rounded-xl overflow-hidden border border-white/10 bg-surface-900">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          attributionPosition="bottom-left"
          style={{ background: 'transparent' }}
        >
          <Background color="#ffffff10" gap={24} size={1} />
          <Controls className="!bg-surface-800 !border-white/10 !rounded-lg" />
          <MiniMap
            nodeStrokeWidth={3}
            style={{ background: '#0f172a', border: '1px solid #ffffff10' }}
            nodeColor={(node) => (node.style?.border as string)?.replace('2px solid ', '') ?? '#6366f1'}
          />
        </ReactFlow>
      </div>
    </div>
  )
}
