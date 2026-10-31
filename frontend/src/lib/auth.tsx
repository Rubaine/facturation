import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { get, post } from './api'

type AuthState = 'loading' | 'in' | 'out'

interface AuthContextValue {
  state: AuthState
  login: (password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('loading')
  const qc = useQueryClient()

  useEffect(() => {
    get('/api/auth/me')
      .then(() => setState('in'))
      .catch(() => setState('out'))
    const onLogout = () => setState('out')
    window.addEventListener('auth:logout', onLogout)
    return () => window.removeEventListener('auth:logout', onLogout)
  }, [])

  const login = useCallback(async (password: string) => {
    await post('/api/auth/login', { password })
    setState('in')
  }, [])

  const logout = useCallback(async () => {
    await post('/api/auth/logout').catch(() => undefined)
    qc.clear()
    setState('out')
  }, [qc])

  return <AuthContext.Provider value={{ state, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth hors AuthProvider')
  return ctx
}
