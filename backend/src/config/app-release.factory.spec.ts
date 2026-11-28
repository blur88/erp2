import { resolveAppRelease } from './app-release.factory';

describe('resolveAppRelease', () => {
  describe('valid X.Y.Z version', () => {
    it.each(['development', 'production', undefined])(
      'reports the version as-is when NODE_ENV is %p',
      (nodeEnv) => {
        expect(resolveAppRelease({ NODE_ENV: nodeEnv, APP_VERSION: '3.17.1' })).toEqual({
          version: '3.17.1',
          status: 'released',
          configurationError: null,
        });
      },
    );
  });

  describe('missing version', () => {
    it('reports unreleased as a development build in development', () => {
      expect(resolveAppRelease({ NODE_ENV: 'development' })).toEqual({
        version: 'unreleased',
        status: 'development',
        configurationError: null,
      });
    });

    it('treats an unset NODE_ENV as development', () => {
      expect(resolveAppRelease({ APP_VERSION: '' })).toEqual({
        version: 'unreleased',
        status: 'development',
        configurationError: null,
      });
    });

    it('reports unreleased with a configuration error in production', () => {
      const release = resolveAppRelease({ NODE_ENV: 'production' });

      expect(release.version).toBe('unreleased');
      expect(release.status).toBe('misconfigured');
      expect(release.configurationError).toMatch(/APP_VERSION/);
      expect(release.configurationError).toMatch(/production/);
    });
  });

  describe('invalid version', () => {
    it.each(['v3.17.1', '3.17', '3.17.1.4', '3.17.1-rc.1', '01.2.3', ' 3.17.1', 'latest', '0.0.0-development'])(
      'rejects %p in development',
      (appVersion) => {
        expect(resolveAppRelease({ NODE_ENV: 'development', APP_VERSION: appVersion })).toEqual({
          version: 'unreleased',
          status: 'development',
          configurationError: null,
        });
      },
    );

    it.each(['v3.17.1', '3.17', '3.17.1.4', '3.17.1-rc.1', '01.2.3', ' 3.17.1', 'latest', '0.0.0-development'])(
      'rejects %p in production with a configuration error',
      (appVersion) => {
        const release = resolveAppRelease({ NODE_ENV: 'production', APP_VERSION: appVersion });

        expect(release.version).toBe('unreleased');
        expect(release.status).toBe('misconfigured');
        expect(release.configurationError).toContain(JSON.stringify(appVersion));
      },
    );
  });

  it('reads process.env by default', () => {
    const original = { NODE_ENV: process.env.NODE_ENV, APP_VERSION: process.env.APP_VERSION };
    try {
      process.env.NODE_ENV = 'production';
      process.env.APP_VERSION = '1.2.3';
      expect(resolveAppRelease().version).toBe('1.2.3');
      delete process.env.APP_VERSION;
      expect(resolveAppRelease()).toMatchObject({ version: 'unreleased', status: 'misconfigured' });
    } finally {
      process.env.NODE_ENV = original.NODE_ENV;
      if (original.APP_VERSION === undefined) delete process.env.APP_VERSION;
      else process.env.APP_VERSION = original.APP_VERSION;
    }
  });
});
