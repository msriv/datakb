import axios, { type AxiosInstance } from 'axios'

// Access token stored in memory only (never localStorage/sessionStorage)
let accessToken: string | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

const api: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true, // required for httpOnly refresh cookie
})

// Attach Bearer token to every request
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

// On 401, attempt silent refresh then retry once
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const resp = await axios.post('/api/auth/refresh', {}, { withCredentials: true })
        setAccessToken(resp.data.access_token)
        original.headers.Authorization = `Bearer ${resp.data.access_token}`
        return api(original)
      } catch {
        setAccessToken(null)
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export default api
