import { extractAccessToken } from '../../src/modules/auth/tokens/access-token.extractor';

describe('extractAccessToken', () => {
  function makeJwt(header: object, payload: object = { sub: '123' }): string {
    const h = Buffer.from(JSON.stringify(header)).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const s = 'signature';
    return `${h}.${p}.${s}`;
  }

  it('returns the token for a well-formed HS256/JWT bearer', () => {
    const token = makeJwt({ alg: 'HS256', typ: 'JWT' });
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as any;
    expect(extractAccessToken(req)).toBe(token);
  });

  it('returns null when header is absent', () => {
    const req = { headers: {} } as any;
    expect(extractAccessToken(req)).toBeNull();
  });

  it('returns null for a non-Bearer scheme', () => {
    const token = makeJwt({ alg: 'HS256', typ: 'JWT' });
    const req = {
      headers: { authorization: `Basic ${token}` },
    } as any;
    expect(extractAccessToken(req)).toBeNull();
  });

  it('returns null for an unparseable first segment', () => {
    const req = {
      headers: { authorization: 'Bearer not-valid-base64-json.abc.def' },
    } as any;
    expect(extractAccessToken(req)).toBeNull();
  });

  it('returns null for typ erp-refresh+jwt', () => {
    const token = makeJwt({ alg: 'HS256', typ: 'erp-refresh+jwt' });
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as any;
    expect(extractAccessToken(req)).toBeNull();
  });

  it('returns null for missing typ', () => {
    const token = makeJwt({ alg: 'HS256' });
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as any;
    expect(extractAccessToken(req)).toBeNull();
  });

  it('returns null for alg none', () => {
    const token = makeJwt({ alg: 'none', typ: 'JWT' });
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as any;
    expect(extractAccessToken(req)).toBeNull();
  });

  it('returns null for another algorithm like HS384', () => {
    const token = makeJwt({ alg: 'HS384', typ: 'JWT' });
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as any;
    expect(extractAccessToken(req)).toBeNull();
  });
});
