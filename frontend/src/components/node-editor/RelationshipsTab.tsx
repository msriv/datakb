import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { graphApi } from '@/api/graph'
import type { DataKBEdge, DataKBNode, EdgeLabel } from '@/types'

interface RelationshipsTabProps {
  nodeId: string
  nodes: DataKBNode[]
  edges: DataKBEdge[]
  edgeLabels: EdgeLabel[]
}

export default function RelationshipsTab({ nodeId, nodes, edges, edgeLabels }: RelationshipsTabProps) {
  const queryClient = useQueryClient()
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]))

  const relevantEdges = edges.filter(
    (e) => e.source_id === nodeId || e.target_id === nodeId,
  )

  const [targetId, setTargetId] = useState('')
  const [label, setLabel] = useState<EdgeLabel>('reads_from')
  const [direction, setDirection] = useState<'outgoing' | 'incoming'>('outgoing')
  const [addError, setAddError] = useState<string | null>(null)
  const [nodeSearch, setNodeSearch] = useState('')

  const filteredNodes = nodes
    .filter((n) => n.id !== nodeId)
    .filter((n) =>
      !nodeSearch || n.title.toLowerCase().includes(nodeSearch.toLowerCase()),
    )

  const createEdgeMutation = useMutation({
    mutationFn: () =>
      graphApi.createEdge({
        source_id: direction === 'outgoing' ? nodeId : targetId,
        target_id: direction === 'outgoing' ? targetId : nodeId,
        label,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['graph'] })
      setTargetId('')
      setNodeSearch('')
      setAddError(null)
    },
    onError: () => setAddError('Failed to create edge (may already exist)'),
  })

  const deleteEdgeMutation = useMutation({
    mutationFn: (edgeId: string) => graphApi.deleteEdge(edgeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['graph'] }),
  })

  const selectClass =
    'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-[var(--accent)]'

  return (
    <div className="space-y-6">
      {/* Current edges */}
      <div>
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Current relationships</h3>
        {relevantEdges.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No relationships yet.</p>
        ) : (
          <div className="space-y-1">
            {relevantEdges.map((e) => {
              const isOutgoing = e.source_id === nodeId
              const otherId = isOutgoing ? e.target_id : e.source_id
              const other = nodeMap[otherId]
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2"
                >
                  <span className="text-[var(--text-secondary)] text-xs font-mono w-6">
                    {isOutgoing ? '→' : '←'}
                  </span>
                  <span className="text-xs font-mono text-[var(--accent)] w-24 shrink-0">{e.label}</span>
                  <span className="text-sm text-[var(--text-primary)] truncate flex-1">
                    {other?.title ?? otherId}
                  </span>
                  <button
                    onClick={() => deleteEdgeMutation.mutate(e.id)}
                    className="text-[var(--text-secondary)] hover:text-red-400 text-xs transition-colors"
                  >
                    remove
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add edge form */}
      <div>
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Add relationship</h3>
        {addError && (
          <div className="text-red-400 text-xs mb-2">{addError}</div>
        )}
        <div className="space-y-3 bg-[var(--surface-2)] border border-[var(--border)] rounded p-3">
          <div className="flex gap-2">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Direction</label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'outgoing' | 'incoming')}
                className={selectClass}
              >
                <option value="outgoing">This node →</option>
                <option value="incoming">→ This node</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Label</label>
              <select
                value={label}
                onChange={(e) => setLabel(e.target.value as EdgeLabel)}
                className={selectClass}
              >
                {edgeLabels.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Target node</label>
            <input
              type="text"
              value={nodeSearch}
              onChange={(e) => { setNodeSearch(e.target.value); setTargetId('') }}
              placeholder="Search for a node…"
              className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
            />
            {nodeSearch && !targetId && (
              <div className="mt-1 border border-[var(--border)] rounded overflow-hidden max-h-36 overflow-y-auto">
                {filteredNodes.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-[var(--text-secondary)]">No nodes found</div>
                ) : (
                  filteredNodes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => { setTargetId(n.id); setNodeSearch(n.title) }}
                      className="w-full text-left px-2 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
                    >
                      {n.title}
                      <span className="text-xs text-[var(--text-secondary)] ml-2">{n.type}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => createEdgeMutation.mutate()}
            disabled={!targetId || createEdgeMutation.isPending}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm px-3 py-1.5 rounded transition-colors disabled:opacity-50"
          >
            {createEdgeMutation.isPending ? 'Adding…' : 'Add relationship'}
          </button>
        </div>
      </div>
    </div>
  )
}
