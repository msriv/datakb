import api from './client'
import type {
  CreateEdgeRequest,
  CreateNodeRequest,
  DataKBEdge,
  DataKBNode,
  GraphResponse,
  UpdateNodeRequest,
} from '@/types'

export const graphApi = {
  getGraph: () => api.get<GraphResponse>('/graph').then((r) => r.data),
  getNode: (id: string) => api.get<DataKBNode>(`/nodes/${id}`).then((r) => r.data),
  createNode: (data: CreateNodeRequest) => api.post<DataKBNode>('/nodes', data).then((r) => r.data),
  updateNode: (id: string, data: UpdateNodeRequest) =>
    api.put<DataKBNode>(`/nodes/${id}`, data).then((r) => r.data),
  deleteNode: (id: string) => api.delete(`/nodes/${id}`),
  createEdge: (data: CreateEdgeRequest) =>
    api.post<DataKBEdge>('/edges', data).then((r) => r.data),
  deleteEdge: (id: string) => api.delete(`/edges/${id}`),
}
