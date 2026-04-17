import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  type Edge as RFEdge,
  type Node as RFNode,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useQuery } from '@tanstack/react-query'
import { graphApi } from '@/api/graph'
import { useGraphStore } from '@/stores/graphStore'
import type { DataKBNode } from '@/types'
import { NodeRenderer } from './NodeRenderer'
import { EdgeRenderer } from './EdgeRenderer'
import TopBar from './TopBar'
import NodeDetailPanel from './NodeDetailPanel'
import EmptyGraphState from './EmptyGraphState'

const nodeTypes = { datakb: NodeRenderer }
const edgeTypes = { datakb: EdgeRenderer }

function buildRFNodes(
  nodes: DataKBNode[],
  searchQuery: string,
  typeFilter: string[],
  selectedNodeId: string | null,
): RFNode[] {
  const q = searchQuery.toLowerCase()
  return nodes.map((node, i) => {
    const matchesSearch =
      !q ||
      node.title.toLowerCase().includes(q) ||
      node.tags.some((t) => t.toLowerCase().includes(q)) ||
      (node.team ?? '').toLowerCase().includes(q)
    const matchesType = typeFilter.length === 0 || typeFilter.includes(node.type)
    const isDimmed = !matchesSearch || !matchesType

    return {
      id: node.id,
      type: 'datakb',
      position: { x: (i % 5) * 280 + 40, y: Math.floor(i / 5) * 160 + 40 },
      data: { ...node, isDimmed, isSelected: node.id === selectedNodeId },
      selected: node.id === selectedNodeId,
    }
  })
}

export default function GraphPage() {
  const { selectedNodeId, setSelectedNodeId, searchQuery, typeFilter, setNodes, setEdges } =
    useGraphStore()
  const [layout, setLayout] = useState<'force' | 'hierarchical'>('force')

  const { data: graph, isLoading } = useQuery({
    queryKey: ['graph'],
    queryFn: graphApi.getGraph,
    refetchInterval: 30_000,
  })

  const rfNodes = useMemo(
    () => buildRFNodes(graph?.nodes ?? [], searchQuery, typeFilter, selectedNodeId),
    [graph?.nodes, searchQuery, typeFilter, selectedNodeId],
  )

  const rfEdges: RFEdge[] = useMemo(
    () =>
      (graph?.edges ?? []).map((e) => ({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        type: 'datakb',
        data: { label: e.label },
      })),
    [graph?.edges],
  )

  const [nodes, , onNodesChange] = useNodesState(rfNodes)
  const [edges, , onEdgesChange] = useEdgesState(rfEdges)

  // Sync store after initial load
  useEffect(() => {
    if (graph) {
      setNodes(graph.nodes)
      setEdges(graph.edges)
    }
  }, [graph, setNodes, setEdges])

  // Update RF nodes when filter/search changes
  const [displayNodes, setDisplayNodes] = useState(rfNodes)
  const [displayEdges, setDisplayEdges] = useState(rfEdges)

  useEffect(() => {
    setDisplayNodes(rfNodes)
  }, [rfNodes])

  useEffect(() => {
    setDisplayEdges(rfEdges)
  }, [rfEdges])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: RFNode) => {
      setSelectedNodeId(node.id === selectedNodeId ? null : node.id)
    },
    [selectedNodeId, setSelectedNodeId],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [setSelectedNodeId])

  const selectedNode = graph?.nodes.find((n) => n.id === selectedNodeId)

  return (
    <div className="flex flex-col h-screen bg-[var(--background)]">
      <TopBar onLayoutChange={setLayout} currentLayout={layout} />

      <div className="flex flex-1 min-h-0">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[var(--text-secondary)] font-mono text-sm">Loading graph…</span>
          </div>
        ) : (graph?.nodes.length ?? 0) === 0 ? (
          <div className="flex-1">
            <EmptyGraphState />
          </div>
        ) : (
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            className="flex-1"
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} color="#1e2235" gap={20} size={1} />
            <Controls
              className="!bg-[var(--surface)] !border-[var(--border)]"
              showInteractive={false}
            />
          </ReactFlow>
        )}

        {selectedNode && <NodeDetailPanel node={selectedNode} />}
      </div>
    </div>
  )
}
