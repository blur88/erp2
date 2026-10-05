import type { Request } from 'express';

/**
 * Extracts a Bearer token from the Authorization header and verifies
 * that its JWT header contains exactly alg 'HS256' and typ 'JWT'.
 * Returns null if the header is missing, malformed, or if the token header
 * is invalid or has wrong alg/typ.
 */
export function extractAccessToken(req: Request): string | null {
  const authHeader = req.headers?.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
  if (!match) {
    return null;
  }

  const token = match[1];
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const headerJson = Buffer.from(parts[0], 'base64url').toString('utf8');
    const header = JSON.parse(headerJson);
    if (!header || typeof header !== 'object') {
      return null;
    }
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return null;
    }
  } catch {
    return null;
  }

  return token;
}
