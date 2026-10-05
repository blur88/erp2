import type { AuthUser, LoginCredentials } from '@/store/slices/authSlice'

export type { AuthUser, LoginCredentials }

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
