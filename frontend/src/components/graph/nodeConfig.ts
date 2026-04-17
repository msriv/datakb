import type { NodeType } from '@/types'

interface NodeStyle {
  bg: string
  border: string
  icon: string
}

export const NODE_STYLES: Record<NodeType, NodeStyle> = {
  service:    { bg: '#1e293b', border: '#3b82f6', icon: '⬡' },
  pipeline:   { bg: '#1a2e2e', border: '#2dd4bf', icon: '→' },
  database:   { bg: '#1e1b2e', border: '#a78bfa', icon: '⬢' },
  redis:      { bg: '#2a1a1a', border: '#f97316', icon: '⚡' },
  gcs_bucket: { bg: '#2a2416', border: '#fbbf24', icon: '▣' },
  schema:     { bg: '#1a1d27', border: '#6b7280', icon: '≡' },
  note:       { bg: '#1a1d27', border: '#374151', icon: '✎' },
  team:       { bg: '#1a2e1a', border: '#4ade80', icon: '⬟' },
}

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  service:    'Service',
  pipeline:   'Pipeline',
  database:   'Database',
  redis:      'Redis',
  gcs_bucket: 'GCS Bucket',
  schema:     'Schema',
  note:       'Note',
  team:       'Team',
}
