import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { setUser } = useAuthStore()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const user = await authApi.login(email, password)
      setUser(user)
      navigate('/')
    } catch {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--background)]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="font-mono text-2xl font-bold text-[var(--text-primary)]">◈ DataKB</span>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Sign in to your knowledge graph</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-[var(--surface)] p-6 rounded-lg border border-[var(--border)]">
          {error && (
            <div className="text-red-400 text-sm bg-red-950/30 border border-red-900 rounded px-3 py-2">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium rounded px-4 py-2 text-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
