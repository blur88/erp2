import { loadRefreshKeys } from '../../src/modules/auth/tokens/refresh-keys';

describe('refresh-keys', () => {
  const S1 = 'a'.repeat(32);
  const S2 = 'b'.repeat(40);

  it('parses a set and exposes the active key', () => {
    const k = loadRefreshKeys({
      JWT_REFRESH_KEYS: `k1=${S1}, k2=${S2}`,
      JWT_REFRESH_ACTIVE_KID: 'k2',
    });
    expect(k.activeKid).toBe('k2');
    expect(k.secretFor('k1')).toBe(S1);
    expect(k.secretFor('nope')).toBeUndefined();
    expect(k.kids()).toEqual(['k1', 'k2']);
  });

  it.each([
    ['missing keys', { JWT_REFRESH_ACTIVE_KID: 'k1' }, /JWT_REFRESH_KEYS/],
    ['missing active kid', { JWT_REFRESH_KEYS: `k1=${S1}` }, /JWT_REFRESH_ACTIVE_KID/],
    ['active kid not in set', { JWT_REFRESH_KEYS: `k1=${S1}`, JWT_REFRESH_ACTIVE_KID: 'k9' }, /k9/],
    ['duplicate kid', { JWT_REFRESH_KEYS: `k1=${S1},k1=${S2}`, JWT_REFRESH_ACTIVE_KID: 'k1' }, /k1/],
    ['bad kid', { JWT_REFRESH_KEYS: `k 1=${S1}`, JWT_REFRESH_ACTIVE_KID: 'k 1' }, /JWT_REFRESH_KEYS/],
    ['short secret', { JWT_REFRESH_KEYS: 'k1=short', JWT_REFRESH_ACTIVE_KID: 'k1' }, /k1/],
    [
      'secret equals JWT_SECRET',
      { JWT_REFRESH_KEYS: `k1=${S1}`, JWT_REFRESH_ACTIVE_KID: 'k1', JWT_SECRET: S1 },
      /JWT_SECRET/,
    ],
  ])('rejects %s', (_n, env, pattern) => {
    expect(() => loadRefreshKeys(env)).toThrow(pattern);
  });

  it('splits at the first = so padded secrets work', () => {
    const padded = 'q'.repeat(40) + '==';
    expect(
      loadRefreshKeys({ JWT_REFRESH_KEYS: `k1=${padded}`, JWT_REFRESH_ACTIVE_KID: 'k1' }).secretFor(
        'k1',
      ),
    ).toBe(padded);
  });

  it('never puts a secret in an error message', () => {
    try {
      loadRefreshKeys({ JWT_REFRESH_KEYS: `k1=${S1},k1=${S2}`, JWT_REFRESH_ACTIVE_KID: 'k1' });
    } catch (e) {
      expect(String(e)).not.toContain(S1);
      expect(String(e)).not.toContain(S2);
    }
  });
});
