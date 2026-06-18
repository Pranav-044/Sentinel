// Environment-driven API base URL — works for localhost dev AND any cloud host
const API_BASE = import.meta.env.VITE_API_URL ?? '/api'
const WS_BASE = import.meta.env.VITE_WS_URL ?? (
  window.location.protocol === 'https:' ? 'wss://' : 'ws://'
) + window.location.host

export const config = {
  apiBase: API_BASE,
  wsBase: WS_BASE,
} as const
