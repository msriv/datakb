import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { authApi } from './api/auth'
import { useAuthStore } from './stores/authStore'
import GraphPage from './components/graph/GraphPage'
import LoginPage from './components/LoginPage'
import SetupPage from './components/SetupPage'
import NodeEditorPage from './components/node-editor/NodeEditorPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--background)]">
        <div className="text-[var(--text-secondary)] font-mono text-sm">Loading…</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default function App() {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    authApi.refresh().then((token) => {
      if (token) {
        authApi.me().then(setUser).catch(() => setUser(null))
      } else {
        setUser(null)
      }
      setLoading(false)
    })
  }, [setUser, setLoading])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <GraphPage />
            </RequireAuth>
          }
        />
        <Route
          path="/nodes/new"
          element={
            <RequireAuth>
              <NodeEditorPage />
            </RequireAuth>
          }
        />
        <Route
          path="/nodes/:id/edit"
          element={
            <RequireAuth>
              <NodeEditorPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
