import React, { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@sentinel/types'
import { api, getAccessToken, clearAccessToken } from '../lib/api'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // If we have an access token, or we might have a refresh token cookie, try to fetch /me
    api.get<User>('/auth/me')
      .then(res => setUser(res.data))
      .catch(() => {
        // Interceptor will try refresh token if it exists
        setUser(null)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const logout = async () => {
    try {
      await api.delete('/auth/logout')
    } finally {
      clearAccessToken()
      setUser(null)
      window.location.href = '/login'
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
