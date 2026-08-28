import { ConfigService } from '@nestjs/config';
import { createSSLConfig } from './ssl.config';

describe('createSSLConfig', () => {
  const configWith = (values: Record<string, string | undefined>) =>
    ({
      get: (key: string, fallback?: string) => values[key] ?? fallback,
    }) as unknown as ConfigService;

  const CERTS = {
    DB_SSL_CA: 'ca-pem',
    DB_SSL_CERT: 'cert-pem',
    DB_SSL_KEY: 'key-pem',
  };

  describe('when DB_SSL is not enabled', () => {
    it('returns false when DB_SSL is unset', () => {
      expect(createSSLConfig(configWith({}))).toBe(false);
    });

    it('returns false when DB_SSL is explicitly false', () => {
      expect(createSSLConfig(configWith({ DB_SSL: 'false' }))).toBe(false);
    });

    it('returns false for any non-"true" value', () => {
      expect(createSSLConfig(configWith({ DB_SSL: '1' }))).toBe(false);
      expect(createSSLConfig(configWith({ DB_SSL: 'TRUE' }))).toBe(false);
      expect(createSSLConfig(configWith({ DB_SSL: '' }))).toBe(false);
    });

    it('returns false even when certificates are present', () => {
      expect(createSSLConfig(configWith({ ...CERTS }))).toBe(false);
      expect(createSSLConfig(configWith({ DB_SSL: 'false', ...CERTS }))).toBe(false);
    });
  });

  describe('when DB_SSL=true', () => {
    it('validates the server certificate with no certificates supplied', () => {
      expect(createSSLConfig(configWith({ DB_SSL: 'true' }))).toEqual({
        rejectUnauthorized: true,
      });
    });

    it('returns the full material when CA, cert and key are all present', () => {
      expect(createSSLConfig(configWith({ DB_SSL: 'true', ...CERTS }))).toEqual({
        rejectUnauthorized: true,
        ca: 'ca-pem',
        cert: 'cert-pem',
        key: 'key-pem',
      });
    });

    it('falls back to server validation when the material is incomplete', () => {
      expect(
        createSSLConfig(configWith({ DB_SSL: 'true', DB_SSL_CA: 'ca-pem' })),
      ).toEqual({ rejectUnauthorized: true });

      expect(
        createSSLConfig(
          configWith({
            DB_SSL: 'true',
            DB_SSL_CA: 'ca-pem',
            DB_SSL_CERT: 'cert-pem',
          }),
        ),
      ).toEqual({ rejectUnauthorized: true });
    });
  });

  // The regression guard for #1158. Production previously ignored DB_SSL and
  // forced { rejectUnauthorized: true }, so docker-compose.prod.yml offered a
  // knob the production code path never read. SSL is now selected by the flag
  // alone; if an environment branch is ever reintroduced, these fail.
  describe('is independent of NODE_ENV', () => {
    const ENVIRONMENTS = ['production', 'development', 'staging', 'test', undefined];

    it.each([
      ['unset', {}, false],
      ['DB_SSL=false', { DB_SSL: 'false' }, false],
      ['DB_SSL=true', { DB_SSL: 'true' }, { rejectUnauthorized: true }],
      [
        'DB_SSL=true with certificates',
        { DB_SSL: 'true', ...CERTS },
        { rejectUnauthorized: true, ...{ ca: 'ca-pem', cert: 'cert-pem', key: 'key-pem' } },
      ],
    ])('resolves %s identically in every environment', (_label, values, expected) => {
      for (const NODE_ENV of ENVIRONMENTS) {
        expect(
          createSSLConfig(configWith({ ...(values as Record<string, string>), NODE_ENV })),
        ).toEqual(expected);
      }
    });
  });
});
