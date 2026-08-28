import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
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

  let warn: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

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

    // #1159. Server trust and client authentication are independent; an
    // earlier revision required all three values before honouring any of them,
    // which silently dropped the CA in the private/managed-CA shape below.
    it('trusts a CA supplied on its own', () => {
      expect(createSSLConfig(configWith({ DB_SSL: 'true', DB_SSL_CA: 'ca-pem' }))).toEqual({
        rejectUnauthorized: true,
        ca: 'ca-pem',
      });
      expect(warn).not.toHaveBeenCalled();
    });

    it('keeps client credentials supplied without a custom CA', () => {
      expect(
        createSSLConfig(
          configWith({ DB_SSL: 'true', DB_SSL_CERT: 'cert-pem', DB_SSL_KEY: 'key-pem' }),
        ),
      ).toEqual({
        rejectUnauthorized: true,
        cert: 'cert-pem',
        key: 'key-pem',
      });

      // Authenticating the client against a publicly-signed server is valid
      // TLS configuration, not a misconfiguration.
      expect(warn).not.toHaveBeenCalled();
    });

    it.each([
      ['key', { DB_SSL_CERT: 'cert-pem' }, 'DB_SSL_CERT is set but DB_SSL_KEY'],
      ['cert', { DB_SSL_KEY: 'key-pem' }, 'DB_SSL_KEY is set but DB_SSL_CERT'],
      [
        'key alongside a CA',
        { DB_SSL_CA: 'ca-pem', DB_SSL_CERT: 'cert-pem' },
        'DB_SSL_CERT is set but DB_SSL_KEY',
      ],
    ])('omits an incomplete client pair and warns when the %s is missing', (_l, values, message) => {
      const result = createSSLConfig(configWith({ DB_SSL: 'true', ...values }));

      expect(result).not.toHaveProperty('cert');
      expect(result).not.toHaveProperty('key');
      expect(result.rejectUnauthorized).toBe(true);

      expect(warn).toHaveBeenCalledTimes(1);
      const warning = warn.mock.calls[0][0] as string;
      expect(warning).toContain(message);

      // The warning names the variables, never their contents.
      expect(warning).not.toContain('cert-pem');
      expect(warning).not.toContain('key-pem');
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
        { rejectUnauthorized: true, ca: 'ca-pem', cert: 'cert-pem', key: 'key-pem' },
      ],
      [
        'DB_SSL=true with a CA only',
        { DB_SSL: 'true', DB_SSL_CA: 'ca-pem' },
        { rejectUnauthorized: true, ca: 'ca-pem' },
      ],
      [
        'DB_SSL=true with client credentials only',
        { DB_SSL: 'true', DB_SSL_CERT: 'cert-pem', DB_SSL_KEY: 'key-pem' },
        { rejectUnauthorized: true, cert: 'cert-pem', key: 'key-pem' },
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
