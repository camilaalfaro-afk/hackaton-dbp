// Mirrors the Swagger schemas. If Swagger changes, this file changes.

export type Permission =
  | 'files:read'
  | 'files:refine'
  | 'refiners:read'
  | 'refiners:write'
  | 'media:upload'
  | 'incidents:read'
  | 'incidents:create'
  | 'team:manage'

export interface ApiErrorBody {
  error: string
  message: string
  details: unknown
  timestamp: string
  path: string
  requestId: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface User {
  id: number
  email: string
  displayName: string
}

export interface Team {
  code: string
  name: string
}

export interface LoginResponse extends TokenPair {
  user: User
}

export interface RegisterResponse extends LoginResponse {
  team: Team
}

export interface RegisterRequest {
  teamName: string
  email: string
  password: string
}

export interface ClearanceStatus {
  granted: boolean
  grantedAt: string | null
}

export interface Me extends User {
  team: Team
  role: { code: string; name: string }
  permissions: Permission[]
  clearance: ClearanceStatus
}

export type BinCode = 'WO' | 'FC' | 'DR' | 'MA'

/** Refined fraction (0 to 1) per bin and overall. */
export interface Progress {
  WO: number
  FC: number
  DR: number
  MA: number
  overall: number
}

export type FileStatus = 'ACTIVE' | 'COMPLETE'

export interface DataFile {
  id: number
  name: string
  rows: number
  cols: number
  /** Side of a tile in cells. Border tiles can be smaller. */
  tileSize: number
  status: FileStatus
  progress: Progress
  refinedGroups: number
  totalGroups: number
  mistakes: number
  updatedAt: string
}

/** Change per file and per workspace: always read from GET /files/{id}/rules. */
export interface Rules {
  tremorThreshold: number
  connectivity: 4 | 8
  minGroupSize: number
  maxGroupSize: number
  binning: {
    strategy: 'DIGIT_SUM_MOD' | 'MAX_DIGIT_MOD'
    order: BinCode[]
  }
}

export interface Tile {
  tileRow: number
  tileCol: number
  originRow: number
  originCol: number
  rows: number
  cols: number
  /** One digit per cell, row by row. */
  values: string
  /** Base64 of one byte per cell (0 to 100), same order. */
  tremor: string
  /** One char per cell: "." unrefined, or W, F, D, M. */
  bins: string
  version: number
}

export interface RefineResult {
  refinementId: number
  bin: BinCode
  size: number
  file: {
    progress: Progress
    refinedGroups: number
    totalGroups: number
    mistakes: number
    status: FileStatus
  }
}

export interface FilePage {
  content: DataFile[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

export interface Check {
  name: string
  passed: boolean
  detail: string
}

export interface IntegrationStatus {
  deploy: {
    origin: string | null
    verifiedAt: string | null
    lastBuildSeen: string | null
    lastBuildSeenAt: string | null
  }
  storage: {
    provider: string | null
    verifiedAt: string | null
    checks: Check[]
  }
  clearance: ClearanceStatus
}

export interface ClearanceCheckResult extends ClearanceStatus {
  checks: Check[]
}

export type MediaPurpose = 'BADGE' | 'INCIDENT'

export interface MediaTicket {
  ticketId: string
  expiresAt: string
  provider: 'SUPABASE' | 'CLOUDINARY'
  /** Supabase only: exact path inside the bucket. */
  objectPath?: string
  bucket?: string
}

export interface Media {
  mediaId: number
  url: string
  width: number
  height: number
  purpose: MediaPurpose
}

export interface Health {
  status: 'ok'
  service: string
  time: string
}
