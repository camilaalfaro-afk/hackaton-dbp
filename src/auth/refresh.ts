import { ApiError, send } from '../lib/http'
import type { TokenPair } from '../types/api'
import { endSession, readRefreshToken, storeTokens } from './session'

const LOCK_NAME = 'lumon.refresh'

// Shared by every request of this tab that needs a new token at the same time.
let inFlight: Promise<string> | null = null

async function rotate(): Promise<string> {
  // Read the token inside the lock: another tab may have rotated it while we waited.
  const refreshToken = readRefreshToken()
  if (!refreshToken) {
    throw new ApiError({ status: 401, code: 'NO_SESSION', message: 'No hay una sesión activa.' })
  }
  try {
    const { data } = await send<TokenPair>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    })
    storeTokens(data)
    return data.accessToken
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // The server rejected the token. Never retry with it: reusing it revokes everything.
      endSession(error.code === 'REFRESH_INVALID' ? 'EXPIRED' : 'REVOKED')
    }
    throw error
  }
}

function withCrossTabLock<T>(task: () => Promise<T>): Promise<T> {
  // Web Locks gives one tab at a time the right to use the single-use refresh token.
  if ('locks' in navigator) return navigator.locks.request(LOCK_NAME, task)
  return task()
}

/**
 * Rotates the tokens and resolves with the new access token.
 * Concurrent callers in this tab share one request; tabs take turns through a lock.
 */
export function refreshSession(): Promise<string> {
  inFlight ??= withCrossTabLock(rotate).finally(() => {
    inFlight = null
  })
  return inFlight
}
