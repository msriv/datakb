import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

export default function EmptyGraphState() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const canEdit = user?.role === 'editor' || user?.role === 'admin'

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
      <div className="text-5xl opacity-20">◈</div>
      <div>
        <h2 className="text-lg font-medium text-[var(--text-primary)]">No nodes yet</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          {canEdit
            ? 'Add your first node to start building the knowledge graph.'
            : 'The graph is empty. Ask an admin or editor to add nodes.'}
        </p>
      </div>
      {canEdit && (
        <button
          onClick={() => navigate('/nodes/new')}
          className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm px-4 py-2 rounded font-medium transition-colors"
        >
          + Add first node
        </button>
      )}
    </div>
  )
}
