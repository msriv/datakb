import { create } from 'zustand'
import type { DataKBEdge, DataKBNode } from '@/types'

interface GraphState {
  nodes: DataKBNode[]
  edges: DataKBEdge[]
  selectedNodeId: string | null
  searchQuery: string
  typeFilter: string[]
  setNodes: (nodes: DataKBNode[]) => void
  setEdges: (edges: DataKBEdge[]) => void
  setSelectedNodeId: (id: string | null) => void
  setSearchQuery: (q: string) => void
  setTypeFilter: (types: string[]) => void
  upsertNode: (node: DataKBNode) => void
  removeNode: (id: string) => void
  removeEdge: (id: string) => void
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  searchQuery: '',
  typeFilter: [],
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setTypeFilter: (types) => set({ typeFilter: types }),
  upsertNode: (node) =>
    set((state) => ({
      nodes: state.nodes.some((n) => n.id === node.id)
        ? state.nodes.map((n) => (n.id === node.id ? node : n))
        : [...state.nodes, node],
    })),
  removeNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source_id !== id && e.target_id !== id),
    })),
  removeEdge: (id) =>
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== id),
    })),
}))
