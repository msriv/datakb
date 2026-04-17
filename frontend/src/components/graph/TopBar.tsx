import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useGraphStore } from '@/stores/graphStore'
import { NODE_TYPE_LABELS } from './nodeConfig'
import type { NodeType } from '@/types'

const ALL_TYPES = Object.keys(NODE_TYPE_LABELS) as NodeType[]

interface TopBarProps {
  onLayoutChange: (layout: 'force' | 'hierarchical') => void
  currentLayout: 'force' | 'hierarchical'
}

export default function TopBar({ onLayoutChange, currentLayout }: TopBarProps) {
  const { searchQuery, setSearchQuery, typeFilter, setTypeFilter } = useGraphStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const canEdit = user?.role === 'editor' || user?.role === 'admin'

  function toggleType(type: NodeType) {
    if (typeFilter.includes(type)) {
      setTypeFilter(typeFilter.filter((t) => t !== type))
    } else {
      setTypeFilter([...typeFilter, type])
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-[var(--surface)] border-b border-[var(--border)] z-10">
      {/* Logo */}
      <span className="font-mono font-bold text-[var(--text-primary)] mr-2">◈ DataKB</span>

      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <input
          type="text"
          placeholder="Search nodes…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-secondary)]"
        />
      </div>

      {/* Type filter pills */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {ALL_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => toggleType(type)}
            className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors whitespace-nowrap ${
              typeFilter.includes(type)
                ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                : 'bg-transparent border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-hover)]'
            }`}
          >
            {NODE_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {/* Layout toggle */}
      <div className="flex items-center gap-1 border border-[var(--border)] rounded overflow-hidden">
        {(['force', 'hierarchical'] as const).map((layout) => (
          <button
            key={layout}
            onClick={() => onLayoutChange(layout)}
            className={`px-2 py-1 text-xs font-mono transition-colors ${
              currentLayout === layout
                ? 'bg-[var(--surface-2)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {layout === 'force' ? '⦿ Force' : '≡ Tree'}
          </button>
        ))}
      </div>

      {/* Add Node */}
      {canEdit && (
        <button
          onClick={() => navigate('/nodes/new')}
          className="ml-auto bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm px-3 py-1.5 rounded font-medium transition-colors whitespace-nowrap"
        >
          + Add node
        </button>
      )}

      {/* User avatar */}
      <div className="w-7 h-7 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-xs text-[var(--text-secondary)] font-mono">
        {(user?.display_name ?? user?.email ?? '?')[0].toUpperCase()}
      </div>
    </div>
  )
}
