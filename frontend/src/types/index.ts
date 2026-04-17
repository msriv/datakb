export type NodeType =
  | 'service'
  | 'pipeline'
  | 'database'
  | 'redis'
  | 'gcs_bucket'
  | 'schema'
  | 'note'
  | 'team'

export type EdgeLabel =
  | 'reads_from'
  | 'writes_to'
  | 'depends_on'
  | 'owns'
  | 'produces'
  | 'consumes'
  | 'triggers'

export type UserRole = 'admin' | 'editor' | 'viewer'

export interface DataKBNode {
  id: string
  title: string
  type: NodeType
  team: string | null
  description: string | null
  tags: string[]
  notebook_path: string | null
  gcp_project_id: string | null
  sa_id: string | null
  resource_bindings: string[]
  created_by: string
  created_at: string
  updated_at: string
  last_run_at: string | null
  last_run_by: string | null
  is_archived: boolean
  active_kernel_count: number
}

export interface DataKBEdge {
  id: string
  source_id: string
  target_id: string
  label: EdgeLabel
  created_by: string
  created_at: string
}

export interface GraphResponse {
  nodes: DataKBNode[]
  edges: DataKBEdge[]
}

export interface User {
  id: string
  email: string
  display_name: string | null
  role: UserRole
  team: string | null
}

export interface CreateNodeRequest {
  title: string
  type: NodeType
  team?: string
  description?: string
  tags?: string[]
  notebook_path?: string
  gcp_project_id?: string
  sa_id?: string
  resource_bindings?: string[]
}

export interface UpdateNodeRequest {
  title?: string
  type?: NodeType
  team?: string
  description?: string
  tags?: string[]
  notebook_path?: string
  gcp_project_id?: string
  sa_id?: string
  resource_bindings?: string[]
}

export interface CreateEdgeRequest {
  source_id: string
  target_id: string
  label: EdgeLabel
}
