import axios from 'axios'
import type { User } from '@/types'
import { setAccessToken } from './client'
import api from './client'

export const authApi = {
  login: async (email: string, password: string): Promise<User> => {
    const resp = await axios.post('/api/auth/login', { email, password }, { withCredentials: true })
    setAccessToken(resp.data.access_token)
    return authApi.me()
  },
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  refresh: async (): Promise<string | null> => {
    try {
      const resp = await axios.post('/api/auth/refresh', {}, { withCredentials: true })
      setAccessToken(resp.data.access_token)
      return resp.data.access_token
    } catch {
      return null
    }
  },
  logout: () => {
    setAccessToken(null)
  },
}
