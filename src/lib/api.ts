import { refreshSession } from '../auth/refresh'
import { endSession, getAccessToken } from '../auth/session'
import { ApiError, send } from './http'
import type { ApiResponse, SendOptions } from './http'

export interface ApiOptions extends Omit<SendOptions, 'token'> {
  /** Set to false for the public routes (login, register, logout, health). */
  auth?: boolean
}

function endSessionIfRejected(error: unknown): void {
  if (!(error instanceof ApiError) || error.status !== 401) return
  if (error.code === 'SESSION_REVOKED') endSession('REVOKED')
  if (error.code === 'TOKEN_INVALID') endSession('EXPIRED')
}

/**
 * The only door to the API. Attaches the access token and, on `TOKEN_EXPIRED` only,
 * refreshes once and retries the request once. Returns the body together with the headers.
 */
export async function apiResponse<T>(path: string, options: ApiOptions = {}): Promise<ApiResponse<T>> {
  const { auth = true, ...request } = options
  if (!auth) return send<T>(path, request)

  const token = getAccessToken() ?? (await refreshSession())
  try {
    return await send<T>(path, { ...request, token })
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'TOKEN_EXPIRED') {
      endSessionIfRejected(error)
      throw error
    }
  }

  // Another request may have refreshed already: reuse its token instead of refreshing again.
  const current = getAccessToken()
  const fresh = current && current !== token ? current : await refreshSession()
  try {
    return await send<T>(path, { ...request, token: fresh })
  } catch (error) {
    endSessionIfRejected(error)
    throw error
  }
}

/** Same as `apiResponse` when only the body matters. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await apiResponse<T>(path, options)
  return response.data
}
