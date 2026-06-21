import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { User } from '@sentinel/types'
import { api, getAccessToken, clearAccessToken } from '../lib/api'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  refetchUser: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refetchUser = useCallback(async () => {
    try {
      const res = await api.get<User>('/api/auth/me')
      setUser(res.data)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    // On mount: try to fetch /me. The axios interceptor will attempt a
    // token refresh from the httpOnly cookie if access token is missing.
    api.get<User>('/api/auth/me')
      .then(res => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))
  }, [])

  const logout = async () => {
    try {
      await api.delete('/api/auth/logout')
    } finally {
      clearAccessToken()
      setUser(null)
      window.location.href = '/login'
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, refetchUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
