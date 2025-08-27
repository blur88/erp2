import { UserRole } from '../../../database/entities/user.entity';

/**
 * JWT payload interface for type safety
 */
export interface JwtPayload {
  sub: string; // Subject - User ID
  username: string;
  email: string;
  role: UserRole;
  sessionId: string;
  iat?: number; // Issued at
  exp?: number; // Expires at
  aud?: string; // Audience
  iss?: string; // Issuer
}

/**
 * JWT refresh payload interface
 */
export interface JwtRefreshPayload {
  sub: string; // Subject - User ID
  sessionId: string;
  tokenVersion: number; // For token revocation
  iat?: number; // Issued at
  exp?: number; // Expires at
}

/**
 * Authenticated request user interface
 */
export interface AuthenticatedUser {
  userId: string;
  username: string;
  email: string;
  role: UserRole;
  sessionId: string;
}