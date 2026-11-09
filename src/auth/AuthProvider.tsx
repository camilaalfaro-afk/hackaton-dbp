import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import type { LoginResponse, Me, Permission, RegisterRequest, RegisterResponse } from '../types/api'
import { AuthContext } from './AuthContext'
import type { AuthContextValue, AuthStatus } from './AuthContext'
import { announceLogin, endSession, readRefreshToken, storeTokens, subscribeSession } from './session'
import type { SessionEndReason } from './session'

interface AuthState {
  status: AuthStatus
  me: Me | null
  notice: string | null
}

const NOTICES: Record<SessionEndReason, string | null> = {
  LOGOUT: null,
  REVOKED: 'Tu sesión fue revocada. Inicia sesión de nuevo.',
  EXPIRED: 'Tu sesión venció. Inicia sesión de nuevo.',
}

function fetchMe(): Promise<Me> {
  return api<Me>('/auth/me')
}

function initialState(): AuthState {
  // With a stored refresh token there may be a session: check before showing the login.
  return { status: readRefreshToken() ? 'restoring' : 'anonymous', me: null, notice: null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState)

  // Restore on load. With no access token in memory, the request refreshes first.
  useEffect(() => {
    if (!readRefreshToken()) return
    let cancelled = false
    fetchMe().then(
      (me) => {
        if (!cancelled) setState({ status: 'authenticated', me, notice: null })
      },
      () => {
        if (!cancelled) setState((current) => ({ ...current, status: 'anonymous', me: null }))
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  // Session changes from this tab's requests and from the other tabs.
  useEffect(
    () =>
      subscribeSession((event) => {
        if (event.type === 'end') {
          setState({ status: 'anonymous', me: null, notice: NOTICES[event.reason] })
          return
        }
        fetchMe().then(
          (me) => setState({ status: 'authenticated', me, notice: null }),
          () => undefined,
        )
      }),
    [],
  )

  const login = useCallback(async (email: string, password: string) => {
    const pair = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    })
    storeTokens(pair)
    const me = await fetchMe()
    setState({ status: 'authenticated', me, notice: null })
    announceLogin()
  }, [])

  const register = useCallback(async (input: RegisterRequest) => {
    const pair = await api<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: input,
      auth: false,
    })
    storeTokens(pair)
    const me = await fetchMe()
    setState({ status: 'authenticated', me, notice: null })
    announceLogin()
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = readRefreshToken()
    try {
      if (refreshToken) {
        await api<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false })
      }
    } catch {
      // The local session ends even if the server could not be reached.
    } finally {
      endSession('LOGOUT')
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      register,
      logout,
      can: (permission: Permission) => state.me?.permissions.includes(permission) ?? false,
    }),
    [state, login, register, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
