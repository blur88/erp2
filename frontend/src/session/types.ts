// Auth-specific User interface matching backend
export interface AuthUser {
  id: string
  username: string
  email: string
  firstName: string
  lastName: string
  fullName?: string
  phoneNumber?: string
  role: 'admin' | 'manager' | 'sales_staff' | 'inventory_staff' | 'procurement_staff'
  status: 'active' | 'inactive' | 'suspended'
  isActive: boolean
  lastLoginAt?: Date | string
  lastLoginIp?: string
  failedLoginAttempts: number
  lockedUntil?: Date | string
  isLocked?: boolean
  notes?: string
  requiresPasswordChange?: boolean
  createdAt: Date | string
  updatedAt: Date | string
}

export interface LoginCredentials {
  usernameOrEmail: string
  password: string
  rememberMe?: boolean
}

export interface ActiveSession {
  sessionId: string
  generation: number
  accessToken: string
  accessTokenExpiresAt: number
  refreshToken: string
  user: AuthUser
  rememberMe: boolean
}

export interface SessionRecord {
  revision: number
  session: ActiveSession | null
}

export interface Lease {
  owner: string
  expiresAt: number
}

export interface StoredState {
  record: SessionRecord
  slices: { sessionId: string; json: string } | null
  refreshLease: Lease | null
}

export interface SessionRef {
  sessionId: string
  generation: number
}

export interface TokenResponse {
  sessionId: string
  generation: number
  accessToken: string
  accessTokenExpiresAt: number
  refreshToken: string
  user: AuthUser
}

export class SessionEndedError extends Error {}
export class StorageTimeoutError extends Error {}
export class StorageUnavailableError extends Error {}
