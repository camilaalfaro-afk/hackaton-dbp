import { api } from '../lib/api'
import { ApiError } from '../lib/http'
import { withRetry } from '../lib/retry'
import type { Media, MediaPurpose, MediaTicket } from '../types/api'
import type { ProcessedImage } from './processImage'

export interface UploadHandle {
  /** Resolves with the confirmed media. Rejects with an AbortError when cancelled. */
  promise: Promise<Media>
  cancel: () => void
}

function storageConfig(): { url: string; key: string } {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new ApiError({ status: 0, code: 'STORAGE_NOT_CONFIGURED', message: 'El storage de imágenes no está configurado.' })
  }
  return { url: url.replace(/\/+$/, ''), key }
}

/** XMLHttpRequest instead of fetch: it reports real upload progress. */
function put(url: string, key: string, blob: Blob, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', url)
    request.setRequestHeader('Authorization', `Bearer ${key}`)
    request.setRequestHeader('apikey', key)
    request.setRequestHeader('Content-Type', 'image/webp')
    // Never overwrite: every ticket has its own path.
    request.setRequestHeader('x-upsert', 'false')

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(1)
        resolve()
      } else {
        reject(new ApiError({ status: request.status, code: 'STORAGE_UPLOAD_FAILED', message: 'El storage rechazó la imagen.' }))
      }
    }
    request.onerror = () => {
      reject(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'No se pudo subir la imagen.' }))
    }
    request.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', () => request.abort(), { once: true })
    request.send(blob)
  })
}

/**
 * The only way an image reaches Lumon: ask for a ticket, upload the exact file to the
 * path the ticket names, then confirm so the backend can verify what is there.
 */
export function uploadImage(
  purpose: MediaPurpose,
  image: ProcessedImage,
  onProgress: (fraction: number) => void,
): UploadHandle {
  const controller = new AbortController()
  const { signal } = controller

  async function run(): Promise<Media> {
    const { url, key } = storageConfig()
    const ticket = await withRetry(
      (s) =>
        api<MediaTicket>('/media/tickets', {
          method: 'POST',
          body: {
            purpose,
            contentType: 'image/webp',
            bytes: image.bytes,
            sha256: image.sha256,
            width: image.width,
            height: image.height,
          },
          signal: s,
        }),
      signal,
    )
    if (!ticket.bucket || !ticket.objectPath) {
      throw new ApiError({ status: 0, code: 'STORAGE_MISMATCH', message: 'El ticket no corresponde a Supabase.' })
    }

    await put(`${url}/storage/v1/object/${ticket.bucket}/${ticket.objectPath}`, key, image.blob, onProgress, signal)

    // Confirming is idempotent, so it is safe to retry.
    return withRetry(
      (s) =>
        api<Media>(`/media/tickets/${ticket.ticketId}/confirm`, {
          method: 'POST',
          body: { url: `${url}/storage/v1/object/public/${ticket.bucket}/${ticket.objectPath}` },
          signal: s,
        }),
      signal,
    )
  }

  return { promise: run(), cancel: () => controller.abort() }
}
