import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

type Step = 'welcome' | 'create_admin' | 'seed_data' | 'done'

export default function SetupPage() {
  const [step, setStep] = useState<Step>('welcome')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loadExamples, setLoadExamples] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    axios.get('/api/setup/status').then((r) => {
      if (!r.data.first_run) navigate('/')
    })
  }, [navigate])

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError("Passwords don't match")
      return
    }
    setError(null)
    setLoading(true)
    try {
      await axios.post('/api/setup/admin', { email, display_name: displayName, password })
      setStep('seed_data')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  async function finishSetup() {
    setLoading(true)
    try {
      await axios.post('/api/setup/seed', { load_examples: loadExamples })
      setStep('done')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--background)]">
      <div className="w-full max-w-md bg-[var(--surface)] rounded-lg border border-[var(--border)] p-8">
        {step === 'welcome' && (
          <div className="text-center space-y-4">
            <div className="font-mono text-3xl font-bold text-[var(--text-primary)]">◈ DataKB</div>
            <p className="text-[var(--text-secondary)]">Welcome. Let's get your knowledge graph set up.</p>
            <p className="text-sm text-[var(--text-secondary)]">This takes about 2 minutes.</p>
            <button
              onClick={() => setStep('create_admin')}
              className="mt-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium rounded px-6 py-2 text-sm transition-colors"
            >
              Get started →
            </button>
          </div>
        )}

        {step === 'create_admin' && (
          <form onSubmit={createAdmin} className="space-y-4">
            <h2 className="font-medium text-[var(--text-primary)] mb-4">Create your admin account</h2>
            {error && (
              <div className="text-red-400 text-sm bg-red-950/30 border border-red-900 rounded px-3 py-2">
                {error}
              </div>
            )}
            {[
              { label: 'Email', type: 'email', value: email, onChange: setEmail },
              { label: 'Display name', type: 'text', value: displayName, onChange: setDisplayName },
              { label: 'Password', type: 'password', value: password, onChange: setPassword },
              { label: 'Confirm password', type: 'password', value: confirmPassword, onChange: setConfirmPassword },
            ].map(({ label, type, value, onChange }) => (
              <div key={label}>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">{label}</label>
                <input
                  type={type}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  required
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            ))}
            <p className="text-xs text-[var(--text-secondary)]">This account will have full admin access.</p>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium rounded px-4 py-2 text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create account →'}
            </button>
          </form>
        )}

        {step === 'seed_data' && (
          <div className="space-y-6">
            <h2 className="font-medium text-[var(--text-primary)]">Load example knowledge graph?</h2>
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="seed"
                  checked={loadExamples}
                  onChange={() => setLoadExamples(true)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm text-[var(--text-primary)]">Yes — load 5 example nodes</div>
                  <div className="text-xs text-[var(--text-secondary)]">Auth service, Redis cache, data pipeline, BigQuery dataset, and schema</div>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="seed"
                  checked={!loadExamples}
                  onChange={() => setLoadExamples(false)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm text-[var(--text-primary)]">No — start with an empty graph</div>
                </div>
              </label>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">You can delete the examples any time.</p>
            <button
              onClick={finishSetup}
              disabled={loading}
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium rounded px-4 py-2 text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Continue →'}
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center space-y-4">
            <div className="text-4xl">✓</div>
            <h2 className="font-medium text-[var(--text-primary)]">Setup complete!</h2>
            <p className="text-sm text-[var(--text-secondary)]">Your knowledge graph is ready.</p>
            <button
              onClick={() => navigate('/login')}
              className="mt-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium rounded px-6 py-2 text-sm transition-colors"
            >
              Go to login →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
