import { config } from './config'
import type { ApiErrorBody } from '../types/api'

interface ApiErrorInit {
  status: number
  code: string
  message: string
  details?: unknown
  retryAfter?: number | null
  requestId?: string | null
}

/** Every failed request becomes one of these. Decide by `code`, never by `message`. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown
  /** Seconds to wait before retrying, from the Retry-After header (429, 503). */
  readonly retryAfter: number | null
  readonly requestId: string | null

  constructor(init: ApiErrorInit) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.details = init.details ?? null
    this.retryAfter = init.retryAfter ?? null
    this.requestId = init.requestId ?? null
  }
}

export interface SendOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Serialized as JSON. */
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  token?: string | null
}

export interface ApiResponse<T> {
  data: T
  status: number
  headers: Headers
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return isRecord(value) && typeof value.error === 'string' && typeof value.message === 'string'
}

function parseRetryAfter(headers: Headers): number | null {
  const seconds = Number(headers.get('Retry-After'))
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/**
 * One HTTP request with no session logic: adds the build header, serializes JSON and
 * turns every failure into an ApiError. Use `api()` from ./api instead of calling this.
 */
export async function send<T>(path: string, options: SendOptions = {}): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'X-Lumon-Build': config.buildSha,
    ...options.headers,
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.token) headers.Authorization = `Bearer ${options.token}`

  let response: Response
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: 'no-store',
    })
  } catch (error) {
    // A cancelled request is not a failure: let the caller see the AbortError.
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'No se pudo conectar con Lumon.' })
  }

  const payload = await readJson(response)

  if (!response.ok) {
    const body = isErrorBody(payload) ? payload : null
    throw new ApiError({
      status: response.status,
      code: body?.error ?? 'UNKNOWN_ERROR',
      message: body?.message ?? `La solicitud falló (${response.status}).`,
      details: body?.details,
      retryAfter: parseRetryAfter(response.headers),
      requestId: body?.requestId ?? response.headers.get('X-Request-Id'),
    })
  }

  return { data: payload as T, status: response.status, headers: response.headers }
}

/**
 * Field-level messages from a server error, keyed by field name.
 * Covers `VALIDATION_ERROR` (details.fields) and conflicts such as `EMAIL_TAKEN` (details.field).
 */
export function fieldErrorsOf(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !isRecord(error.details)) return {}
  const { fields, field } = error.details
  if (isRecord(fields)) {
    const result: Record<string, string> = {}
    for (const [name, message] of Object.entries(fields)) {
      if (typeof message === 'string') result[name] = message
    }
    return result
  }
  if (typeof field === 'string') return { [field]: error.message }
  return {}
}
