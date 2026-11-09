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

export interface Health {
  status: 'ok'
  service: string
  time: string
}
