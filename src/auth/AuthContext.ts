import { createContext, useContext } from 'react'
import type { Me, Permission, RegisterRequest } from '../types/api'

/** `restoring` means "still checking": show a splash, never the login form. */
export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous'

export interface AuthContextValue {
  status: AuthStatus
  me: Me | null
  /** Why the session ended, to show on the login page. Null after a normal logout. */
  notice: string | null
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterRequest) => Promise<void>
  logout: () => Promise<void>
  /** The interface is decided by permissions, never by the role code. */
  can: (permission: Permission) => boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
