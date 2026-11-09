import type { TokenPair } from '../types/api'

const REFRESH_KEY = 'lumon.refresh'
const CHANNEL_NAME = 'lumon.session'

export type SessionEndReason = 'LOGOUT' | 'REVOKED' | 'EXPIRED'

export type SessionEvent = { type: 'login' } | { type: 'end'; reason: SessionEndReason }

type Listener = (event: SessionEvent) => void

// The access token lives only here, in this tab's memory. It is never persisted.
let accessToken: string | null = null

const listeners = new Set<Listener>()
const channel = 'BroadcastChannel' in globalThis ? new BroadcastChannel(CHANNEL_NAME) : null

function notify(event: SessionEvent): void {
  for (const listener of listeners) listener(event)
}

function isSessionEvent(value: unknown): value is SessionEvent {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  return value.type === 'login' || value.type === 'end'
}

// Messages from the other tabs of this browser. A tab never receives its own messages.
channel?.addEventListener('message', (message: MessageEvent<unknown>) => {
  if (!isSessionEvent(message.data)) return
  if (message.data.type === 'end') accessToken = null
  notify(message.data)
})

export function getAccessToken(): string | null {
  return accessToken
}

/** The refresh token is shared by every tab through localStorage. */
export function readRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

export function storeTokens(pair: TokenPair): void {
  accessToken = pair.accessToken
  try {
    localStorage.setItem(REFRESH_KEY, pair.refreshToken)
  } catch {
    // Storage blocked: the session still works until the tab reloads.
  }
}

/** Ends the session in this tab and tells every other tab to do the same. */
export function endSession(reason: SessionEndReason): void {
  accessToken = null
  try {
    localStorage.removeItem(REFRESH_KEY)
  } catch {
    // Nothing to clear.
  }
  const event: SessionEvent = { type: 'end', reason }
  notify(event)
  channel?.postMessage(event)
}

/** Tells the other tabs that a session now exists, so they can restore it. */
export function announceLogin(): void {
  channel?.postMessage({ type: 'login' } satisfies SessionEvent)
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
