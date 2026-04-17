import type { NodeType } from '@/types'
import { NODE_TYPE_LABELS } from '@/components/graph/nodeConfig'

const ALL_TYPES = Object.keys(NODE_TYPE_LABELS) as NodeType[]

interface MetadataTabProps {
  title: string; setTitle: (v: string) => void
  type: NodeType; setType: (v: NodeType) => void
  team: string; setTeam: (v: string) => void
  description: string; setDescription: (v: string) => void
  tags: string[]; setTags: (v: string[]) => void
  tagInput: string; setTagInput: (v: string) => void
  addTag: (e: React.KeyboardEvent) => void
}

const inputClass =
  'w-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--accent)]'
const labelClass = 'block text-sm text-[var(--text-secondary)] mb-1'

export default function MetadataTab({
  title, setTitle,
  type, setType,
  team, setTeam,
  description, setDescription,
  tags, setTags,
  tagInput, setTagInput,
  addTag,
}: MetadataTabProps) {
  return (
    <div className="space-y-5">
      <div>
        <label className={labelClass}>Title <span className="text-red-400">*</span></label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Auth Service"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Type <span className="text-red-400">*</span></label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as NodeType)}
          className={inputClass}
        >
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>{NODE_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Team</label>
        <input
          type="text"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          placeholder="platform"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe this node…"
          rows={5}
          className={`${inputClass} resize-none`}
        />
        <p className="text-xs text-[var(--text-secondary)] mt-1">Supports plain text. Markdown will be rendered in the detail panel.</p>
      </div>

      <div>
        <label className={labelClass}>Tags</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-secondary)] text-xs px-2 py-0.5 rounded font-mono"
            >
              {tag}
              <button
                type="button"
                onClick={() => setTags(tags.filter((t) => t !== tag))}
                className="hover:text-[var(--text-primary)] leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={addTag}
          placeholder="Type a tag and press Enter"
          className={inputClass}
        />
      </div>
    </div>
  )
}
