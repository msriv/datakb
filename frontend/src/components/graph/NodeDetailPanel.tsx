import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { graphApi } from '@/api/graph'
import { useGraphStore } from '@/stores/graphStore'
import { useAuthStore } from '@/stores/authStore'
import { NODE_STYLES, NODE_TYPE_LABELS } from './nodeConfig'
import type { DataKBNode } from '@/types'

interface NodeDetailPanelProps {
  node: DataKBNode
}

function RelationshipList({ nodeId, nodes, edges }: { nodeId: string; nodes: DataKBNode[]; edges: { source_id: string; target_id: string; label: string; id: string }[] }) {
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const outgoing = edges.filter((e) => e.source_id === nodeId)
  const incoming = edges.filter((e) => e.target_id === nodeId)
  const navigate = useNavigate()

  if (outgoing.length === 0 && incoming.length === 0) {
    return <p className="text-xs text-[var(--text-secondary)]">No relationships</p>
  }

  return (
    <div className="space-y-1">
      {incoming.map((e) => (
        <div key={e.id} className="flex items-center gap-2 text-sm">
          <span className="text-[var(--text-secondary)] font-mono text-xs w-24 shrink-0">← {e.label}</span>
          <button
            onClick={() => navigate(`/nodes/${e.source_id}/edit`)}
            className="text-[var(--accent)] hover:underline truncate text-left"
          >
            {nodeMap[e.source_id]?.title ?? e.source_id}
          </button>
        </div>
      ))}
      {outgoing.map((e) => (
        <div key={e.id} className="flex items-center gap-2 text-sm">
          <span className="text-[var(--text-secondary)] font-mono text-xs w-24 shrink-0">→ {e.label}</span>
          <button
            onClick={() => navigate(`/nodes/${e.target_id}/edit`)}
            className="text-[var(--accent)] hover:underline truncate text-left"
          >
            {nodeMap[e.target_id]?.title ?? e.target_id}
          </button>
        </div>
      ))}
    </div>
  )
}

export default function NodeDetailPanel({ node }: NodeDetailPanelProps) {
  const { setSelectedNodeId, nodes, edges } = useGraphStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const canEdit = user?.role === 'editor' || user?.role === 'admin'
  const style = NODE_STYLES[node.type] ?? NODE_STYLES.note

  const deleteMutation = useMutation({
    mutationFn: () => graphApi.deleteNode(node.id),
    onSuccess: () => {
      setSelectedNodeId(null)
      queryClient.invalidateQueries({ queryKey: ['graph'] })
    },
  })

  return (
    <div className="w-80 bg-[var(--surface)] border-l border-[var(--border)] flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl" style={{ color: style.border }}>{style.icon}</span>
          <div className="min-w-0">
            <span className="text-xs font-mono text-[var(--text-secondary)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">
              {NODE_TYPE_LABELS[node.type]}
            </span>
            <h2 className="text-sm font-medium text-[var(--text-primary)] mt-1 leading-tight">{node.title}</h2>
          </div>
        </div>
        <button
          onClick={() => setSelectedNodeId(null)}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] ml-2 shrink-0"
        >
          ×
        </button>
      </div>

      {/* Tags */}
      {node.tags.length > 0 && (
        <div className="px-4 py-2 flex flex-wrap gap-1 border-b border-[var(--border)]">
          {node.tags.map((tag) => (
            <span key={tag} className="text-xs bg-[var(--surface-2)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded font-mono">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      {node.description && (
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{node.description}</p>
        </div>
      )}

      {/* Execution config */}
      {(node.gcp_project_id || node.sa_id || node.resource_bindings.length > 0) && (
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-xs font-medium text-[var(--text-secondary)] mb-2 uppercase tracking-wide">Execution</h3>
          <div className="space-y-1 text-sm">
            {node.gcp_project_id && (
              <div className="flex gap-2">
                <span className="text-[var(--text-secondary)] w-20 shrink-0">GCP Project</span>
                <span className="text-[var(--text-primary)] font-mono text-xs truncate">{node.gcp_project_id}</span>
              </div>
            )}
            {node.resource_bindings.length > 0 && (
              <div className="flex gap-2">
                <span className="text-[var(--text-secondary)] w-20 shrink-0">Resources</span>
                <span className="text-[var(--text-primary)] font-mono text-xs">{node.resource_bindings.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Relationships */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <h3 className="text-xs font-medium text-[var(--text-secondary)] mb-2 uppercase tracking-wide">Relationships</h3>
        <RelationshipList nodeId={node.id} nodes={nodes} edges={edges} />
      </div>

      {/* Last run */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="text-xs text-[var(--text-secondary)]">
          {node.last_run_at
            ? `Last run: ${new Date(node.last_run_at).toLocaleString()}`
            : 'Never run'}
        </div>
        {node.active_kernel_count > 0 && (
          <div className="text-xs text-green-400 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            {node.active_kernel_count} active session{node.active_kernel_count > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 flex gap-2 mt-auto">
        {canEdit && (
          <>
            <button
              onClick={() => navigate(`/nodes/${node.id}/edit`)}
              className="flex-1 border border-[var(--border)] text-[var(--text-primary)] text-sm py-1.5 rounded hover:border-[var(--accent)] transition-colors"
            >
              Edit node
            </button>
            {node.notebook_path && (
              <button
                onClick={() => navigate(`/nodes/${node.id}/notebook`)}
                className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm py-1.5 rounded transition-colors"
              >
                Open Notebook ▶
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
