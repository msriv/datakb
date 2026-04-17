import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow'

export const EdgeRenderer = memo(function EdgeRenderer({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? '#6366f1' : '#2e3350',
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className="absolute bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] text-xs px-1.5 py-0.5 rounded font-mono pointer-events-none"
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
