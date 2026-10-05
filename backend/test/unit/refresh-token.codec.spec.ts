import { jest } from '@jest/globals';
import { JwtService } from '@nestjs/jwt';
import { loadRefreshKeys } from '../../src/modules/auth/tokens/refresh-keys';
import {
  encodeRefreshToken,
  hashRefreshToken,
  verifyRefreshToken,
} from '../../src/modules/auth/tokens/refresh-token.codec';

describe('refresh-token.codec', () => {
  const GOLDEN_SECRET = 'golden-vector-secret-0123456789abcdef';
  const keys = loadRefreshKeys({
    JWT_REFRESH_KEYS: `k1=${GOLDEN_SECRET},k2=${'z'.repeat(32)}`,
    JWT_REFRESH_ACTIVE_KID: 'k2',
  });
  const inputs = {
    userId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    generation: 3,
    issuedAt: 1790000000,
    expiresAt: 1790604800,
    keyId: 'k1',
  };
  const GOLDEN =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6ImVycC1yZWZyZXNoK2p3dCIsImtpZCI6ImsxIn0.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJzaWQiOiIyMjIyMjIyMi0yMjIyLTQyMjItODIyMi0yMjIyMjIyMjIyMjIiLCJnZW4iOjMsImp0aSI6IjIyMjIyMjIyLTIyMjItNDIyMi04MjIyLTIyMjIyMjIyMjIyMi4zIiwiaWF0IjoxNzkwMDAwMDAwLCJleHAiOjE3OTA2MDQ4MDB9.59BYFJb3N0Nqi-hkXASltKBY_PAVFHwPPgUAw92E9PU';

  it('encodes the golden vector byte for byte', () =>
    expect(encodeRefreshToken(inputs, keys)).toBe(GOLDEN));

  it('hashes the golden vector', () =>
    expect(hashRefreshToken(GOLDEN)).toBe(
      '2dbf85bb75ee0978535960e2b4ec1c105a16be6d48f874bbfe894b5c2bda9571',
    ));

  it('is independent of property order and of the active key', () => {
    const shuffled = {
      keyId: 'k1',
      expiresAt: 1790604800,
      issuedAt: 1790000000,
      generation: 3,
      sessionId: inputs.sessionId,
      userId: inputs.userId,
    };
    expect(encodeRefreshToken(shuffled, keys)).toBe(GOLDEN); // keys.activeKid is k2
  });

  it('reproduces across a second key-set instance built from the same configuration', () => {
    const again = loadRefreshKeys({
      JWT_REFRESH_KEYS: `k2=${'z'.repeat(32)},k1=${GOLDEN_SECRET}`,
      JWT_REFRESH_ACTIVE_KID: 'k1',
    });
    expect(encodeRefreshToken(inputs, again)).toBe(GOLDEN);
  });

  it('does not read the clock', () => {
    const spy = jest.spyOn(Date, 'now').mockReturnValue(0);
    expect(encodeRefreshToken(inputs, keys)).toBe(GOLDEN);
    spy.mockRestore();
  });

  it('verifies the golden vector although it is long expired', () => {
    expect(verifyRefreshToken(GOLDEN, keys)).toEqual({
      ok: true,
      keyId: 'k1',
      claims: {
        userId: inputs.userId,
        sessionId: inputs.sessionId,
        generation: 3,
        issuedAt: 1790000000,
        expiresAt: 1790604800,
      },
    });
  });

  it('reports an unconfigured kid as key_unavailable', () => {
    const only2 = loadRefreshKeys({
      JWT_REFRESH_KEYS: `k2=${'z'.repeat(32)}`,
      JWT_REFRESH_ACTIVE_KID: 'k2',
    });
    expect(verifyRefreshToken(GOLDEN, only2)).toEqual({
      ok: false,
      reason: 'key_unavailable',
    });
  });

  it('rejects a tampered signature', () =>
    expect(verifyRefreshToken(GOLDEN.slice(0, -2) + 'AA', keys)).toEqual({
      ok: false,
      reason: 'bad_signature',
    }));

  it('rejects an access-style token (typ JWT) signed with a refresh key', () => {
    const t = new JwtService({}).sign(
      { sub: inputs.userId, sid: inputs.sessionId },
      { secret: GOLDEN_SECRET, keyid: 'k1' },
    );
    expect(verifyRefreshToken(t, keys)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects alg none', () => {
    const none = [
      Buffer.from('{"alg":"none","typ":"erp-refresh+jwt","kid":"k1"}').toString('base64url'),
      GOLDEN.split('.')[1],
      '',
    ].join('.');
    expect(verifyRefreshToken(none, keys)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it.each([undefined, null, 42, '', 'not.a.jwt', 'x'.repeat(5000)])(
    'treats %p as malformed',
    (v) => expect(verifyRefreshToken(v, keys)).toEqual({ ok: false, reason: 'malformed' }),
  );

  it('throws when asked to encode with an unconfigured key', () =>
    expect(() => encodeRefreshToken({ ...inputs, keyId: 'gone' }, keys)).toThrow(/gone/));
});
