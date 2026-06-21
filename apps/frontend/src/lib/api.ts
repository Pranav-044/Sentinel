import axios from 'axios'

// In dev, all /api/* calls are proxied by Vite to the API gateway on port 4000.
// In production, /api/* is served by the same host (nginx/cloud), routing to the gateway.
const BASE = import.meta.env.VITE_API_URL ?? ''

export const api = axios.create({
  baseURL: BASE,
  withCredentials: true, // send httpOnly refresh-token cookie automatically
})

// Attach JWT access token from memory to every request
api.interceptors.request.use((req) => {
  const token = getAccessToken()
  if (token) req.headers.Authorization = `Bearer ${token}`
  return req
})

// On 401 → try to refresh, then retry once
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const { data } = await axios.post(`${BASE}/api/auth/refresh`, {}, { withCredentials: true })
        setAccessToken(data.accessToken)
        original.headers.Authorization = `Bearer ${data.accessToken}`
        return api(original)
      } catch {
        clearAccessToken()
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  },
)

// ── In-memory token store (never in localStorage — XSS protection) ────────────
let _accessToken: string | null = null

export function setAccessToken(token: string) { _accessToken = token }
export function getAccessToken() { return _accessToken }
export function clearAccessToken() { _accessToken = null }
