import { ApiError } from './http'

/** Growing wait with jitter. A Retry-After from the server always wins if it is longer. */
export function retryDelay(attempt: number, retryAfterSeconds: number | null): number {
  const growing = Math.min(8000, 500 * 2 ** attempt) + Math.random() * 250
  return Math.max((retryAfterSeconds ?? 0) * 1000, growing)
}

export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Failures worth retrying: the service is unavailable or the network dropped. */
export function isTransient(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 503 || error.code === 'NETWORK_ERROR')
}

/** Runs a request again, with growing waits, while it fails with a transient error. */
export async function withRetry<T>(
  run: (signal?: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
  maxRetries = 5,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run(signal)
    } catch (error) {
      if (!isTransient(error) || attempt >= maxRetries) throw error
      await wait(retryDelay(attempt, error.retryAfter), signal)
    }
  }
}
