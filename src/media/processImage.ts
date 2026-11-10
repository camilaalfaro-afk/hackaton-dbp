// Image preparation in the browser, with no library: crop, resize, WebP and SHA-256.
// Drawing on a canvas creates a new image, so the metadata of the original (EXIF, XMP,
// location) is never carried over.

const BADGE_SIDE = 512
const BADGE_MAX_BYTES = 122_880
const INCIDENT_MIN_SIDE = 800
const INCIDENT_MAX_SIDE = 1600
const INCIDENT_MAX_BYTES = 307_200
const QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]

export type MediaErrorCode = 'WEBP_UNSUPPORTED' | 'TOO_HEAVY' | 'UNREADABLE'

export class MediaError extends Error {
  readonly code: MediaErrorCode

  constructor(code: MediaErrorCode, message: string) {
    super(message)
    this.name = 'MediaError'
    this.code = code
  }
}

/** Square region of the source image, in source pixels. */
export interface CropArea {
  x: number
  y: number
  size: number
}

export interface ProcessedImage {
  blob: Blob
  width: number
  height: number
  bytes: number
  /** Hexadecimal SHA-256 of the exact bytes that will be uploaded. */
  sha256: string
}

export async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new MediaError('UNREADABLE', 'Ese archivo no es una imagen que el navegador pueda leer.')
  }
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // A browser without WebP support silently answers with PNG.
        if (!blob || blob.type !== 'image/webp') {
          reject(new MediaError('WEBP_UNSUPPORTED', 'Este navegador no puede generar imágenes WebP.'))
          return
        }
        resolve(blob)
      },
      'image/webp',
      quality,
    )
  })
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function render(
  source: ImageBitmap,
  crop: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
  maxBytes: number,
): Promise<ProcessedImage | null> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new MediaError('UNREADABLE', 'No se pudo preparar la imagen.')
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height)

  // Lower the quality step by step until the file fits.
  for (const quality of QUALITIES) {
    const blob = await encode(canvas, quality)
    if (blob.size <= maxBytes) {
      return { blob, width, height, bytes: blob.size, sha256: await sha256Hex(blob) }
    }
  }
  return null
}

/** Badge: exactly 512 x 512, WebP, up to 120 KB. */
export async function makeBadge(source: ImageBitmap, crop: CropArea): Promise<ProcessedImage> {
  const area = { x: crop.x, y: crop.y, width: crop.size, height: crop.size }
  const image = await render(source, area, BADGE_SIDE, BADGE_SIDE, BADGE_MAX_BYTES)
  if (!image) throw new MediaError('TOO_HEAVY', 'El fotocheck supera los 120 KB incluso comprimido.')
  return image
}

/** Incident photo: longest side between 800 and 1600, WebP, up to 300 KB. */
export async function makeIncidentPhoto(source: ImageBitmap): Promise<ProcessedImage> {
  const longest = Math.max(source.width, source.height)
  const area = { x: 0, y: 0, width: source.width, height: source.height }
  const start = Math.min(INCIDENT_MAX_SIDE, Math.max(INCIDENT_MIN_SIDE, longest))

  // If it does not fit at the lowest quality, shrink towards the minimum side and try again.
  const sides: number[] = []
  for (let side = start; side > INCIDENT_MIN_SIDE; side -= 200) sides.push(side)
  sides.push(INCIDENT_MIN_SIDE)

  for (const side of sides) {
    const scale = side / longest
    const width = Math.max(1, Math.round(source.width * scale))
    const height = Math.max(1, Math.round(source.height * scale))
    const image = await render(source, area, width, height, INCIDENT_MAX_BYTES)
    if (image) return image
  }
  throw new MediaError('TOO_HEAVY', 'La foto supera los 300 KB incluso comprimida.')
}
