import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { DataKBNode } from '@/types'
import { NODE_STYLES } from './nodeConfig'

type NodeData = DataKBNode & { isSelected?: boolean; isDimmed?: boolean }

export const NodeRenderer = memo(function NodeRenderer({ data }: NodeProps<NodeData>) {
  const style = NODE_STYLES[data.type] ?? NODE_STYLES.note
  const isDimmed = data.isDimmed ?? false

  return (
    <div
      style={{
        background: style.bg,
        borderColor: style.border,
        opacity: isDimmed ? 0.15 : 1,
        transition: 'opacity 0.2s',
      }}
      className="border rounded-lg px-4 py-3 min-w-[160px] max-w-[240px] cursor-pointer select-none"
    >
      <Handle type="target" position={Position.Left} className="!bg-[var(--border)] !border-0 !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg leading-none" style={{ color: style.border }}>{style.icon}</span>
        <div className="flex items-center gap-1.5 ml-auto">
          {data.notebook_path && (
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: style.border }}
              title="Notebook attached"
            />
          )}
          {data.active_kernel_count > 0 && (
            <span className="flex items-center gap-0.5">
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ background: '#22c55e' }}
                title={`${data.active_kernel_count} active kernel(s)`}
              />
              <span className="text-xs text-green-400">{data.active_kernel_count}</span>
            </span>
          )}
        </div>
      </div>

      <div className="font-medium text-sm text-[var(--text-primary)] leading-tight truncate">
        {data.title}
      </div>

      {data.team && (
        <div className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{data.team}</div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-[var(--border)] !border-0 !w-2 !h-2" />
    </div>
  )
})
