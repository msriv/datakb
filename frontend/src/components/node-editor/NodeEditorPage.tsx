import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { graphApi } from '@/api/graph'
import type { CreateNodeRequest, DataKBNode, EdgeLabel, NodeType, UpdateNodeRequest } from '@/types'
import { NODE_TYPE_LABELS } from '@/components/graph/nodeConfig'
import MetadataTab from './MetadataTab'
import RelationshipsTab from './RelationshipsTab'

type Tab = 'metadata' | 'relationships'

const EDGE_LABELS: EdgeLabel[] = ['reads_from', 'writes_to', 'depends_on', 'owns', 'produces', 'consumes', 'triggers']

export default function NodeEditorPage() {
  const { id } = useParams<{ id?: string }>()
  const isNew = !id
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<Tab>('metadata')

  // Form state
  const [title, setTitle] = useState('')
  const [type, setType] = useState<NodeType>('service')
  const [team, setTeam] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: existingNode } = useQuery({
    queryKey: ['node', id],
    queryFn: () => graphApi.getNode(id!),
    enabled: !!id,
  })

  const { data: graph } = useQuery({
    queryKey: ['graph'],
    queryFn: graphApi.getGraph,
  })

  useEffect(() => {
    if (existingNode) {
      setTitle(existingNode.title)
      setType(existingNode.type)
      setTeam(existingNode.team ?? '')
      setDescription(existingNode.description ?? '')
      setTags(existingNode.tags)
    }
  }, [existingNode])

  const createMutation = useMutation({
    mutationFn: (data: CreateNodeRequest) => graphApi.createNode(data),
    onSuccess: (node) => {
      queryClient.invalidateQueries({ queryKey: ['graph'] })
      navigate(`/nodes/${node.id}/edit`)
    },
    onError: () => setError('Failed to create node'),
  })

  const updateMutation = useMutation({
    mutationFn: (data: UpdateNodeRequest) => graphApi.updateNode(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['graph'] })
      queryClient.invalidateQueries({ queryKey: ['node', id] })
    },
    onError: () => setError('Failed to save node'),
  })

  function handleSave() {
    setError(null)
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    const payload = {
      title: title.trim(),
      type,
      team: team.trim() || undefined,
      description: description.trim() || undefined,
      tags,
    }
    if (isNew) {
      createMutation.mutate(payload)
    } else {
      updateMutation.mutate(payload)
    }
  }

  function addTag(e: React.KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault()
      const newTag = tagInput.trim().toLowerCase()
      if (!tags.includes(newTag)) setTags([...tags, newTag])
      setTagInput('')
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="h-screen flex flex-col bg-[var(--background)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)]">
        <button
          onClick={() => navigate('/')}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition-colors"
        >
          ← Graph
        </button>
        <h1 className="font-medium text-[var(--text-primary)]">
          {isNew ? 'New node' : existingNode?.title ?? 'Edit node'}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-red-400 text-sm">{error}</span>}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm px-4 py-1.5 rounded font-medium transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] bg-[var(--surface)]">
        {(['metadata', 'relationships'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-[var(--accent)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab === 'metadata' ? '① Metadata' : '③ Relationships'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
        {activeTab === 'metadata' && (
          <MetadataTab
            title={title} setTitle={setTitle}
            type={type} setType={setType}
            team={team} setTeam={setTeam}
            description={description} setDescription={setDescription}
            tags={tags} setTags={setTags}
            tagInput={tagInput} setTagInput={setTagInput}
            addTag={addTag}
          />
        )}
        {activeTab === 'relationships' && !isNew && id && graph && (
          <RelationshipsTab
            nodeId={id}
            nodes={graph.nodes}
            edges={graph.edges}
            edgeLabels={EDGE_LABELS}
          />
        )}
        {activeTab === 'relationships' && isNew && (
          <p className="text-sm text-[var(--text-secondary)]">Save the node first to add relationships.</p>
        )}
      </div>
    </div>
  )
}
