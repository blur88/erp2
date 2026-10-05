import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { RefreshKeySet } from './refresh-keys';

export const REFRESH_TYP = 'erp-refresh+jwt';

export interface RefreshTokenInputs {
  userId: string;
  sessionId: string;
  generation: number;
  issuedAt: number;
  expiresAt: number; // epoch seconds, integers
  keyId: string;
}

export type RefreshVerifyFailure = 'malformed' | 'key_unavailable' | 'bad_signature';

export type RefreshVerifyResult =
  | {
      ok: true;
      claims: {
        userId: string;
        sessionId: string;
        generation: number;
        issuedAt: number;
        expiresAt: number;
      };
      keyId: string;
    }
  | { ok: false; reason: RefreshVerifyFailure };

export function encodeRefreshToken(inputs: RefreshTokenInputs, keys: RefreshKeySet): string {
  const secret = keys.secretFor(inputs.keyId);
  if (!secret) {
    throw new Error(`Refresh key '${inputs.keyId}' is not configured`);
  }

  const payload = {
    sub: inputs.userId,
    sid: inputs.sessionId,
    gen: inputs.generation,
    jti: `${inputs.sessionId}.${inputs.generation}`,
    iat: inputs.issuedAt,
    exp: inputs.expiresAt,
  };

  const jwtService = new JwtService({});
  return jwtService.sign(payload, {
    secret,
    algorithm: 'HS256',
    header: {
      alg: 'HS256',
      typ: REFRESH_TYP,
      kid: inputs.keyId,
    },
  });
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyRefreshToken(token: unknown, keys: RefreshKeySet): RefreshVerifyResult {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
    return { ok: false, reason: 'malformed' };
  }

  const jwtService = new JwtService({});
  let decoded: { header?: Record<string, unknown>; payload?: Record<string, unknown> } | null =
    null;

  try {
    decoded = jwtService.decode(token, { complete: true }) as {
      header?: Record<string, unknown>;
      payload?: Record<string, unknown>;
    } | null;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  // V1: parse header
  if (!decoded || !decoded.header || typeof decoded.header !== 'object') {
    return { ok: false, reason: 'malformed' };
  }

  if (decoded.header.alg !== 'HS256' || decoded.header.typ !== REFRESH_TYP) {
    return { ok: false, reason: 'malformed' };
  }

  const kid = decoded.header.kid;
  if (typeof kid !== 'string' || !kid) {
    return { ok: false, reason: 'malformed' };
  }

  // V2: resolve kid
  const secret = keys.secretFor(kid);
  if (!secret) {
    return { ok: false, reason: 'key_unavailable' };
  }

  // V3: verify signature with algorithms: ['HS256'], ignoreExpiration: true
  let payload: Record<string, unknown>;
  try {
    payload = jwtService.verify(token, {
      secret,
      algorithms: ['HS256'],
      ignoreExpiration: true,
    }) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }

  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'malformed' };
  }

  const { sub, sid, gen, jti, iat, exp } = payload;

  if (
    typeof sub !== 'string' ||
    !sub ||
    typeof sid !== 'string' ||
    !sid ||
    !Number.isInteger(gen) ||
    !Number.isInteger(iat) ||
    !Number.isInteger(exp) ||
    jti !== `${sid}.${gen}`
  ) {
    return { ok: false, reason: 'malformed' };
  }

  return {
    ok: true,
    keyId: kid,
    claims: {
      userId: sub,
      sessionId: sid,
      generation: gen as number,
      issuedAt: iat as number,
      expiresAt: exp as number,
    },
  };
}
