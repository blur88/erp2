import { ConfigService } from '@nestjs/config';
import { SecurityConfigBuilder } from './security.config';

// ConfigService falls back to process.env, and CI exports FRONTEND_URL and
// ALLOWED_ORIGINS for the e2e job (ci.yml). Clear them so the defaults under
// test are really the defaults, whatever the host environment says.
const AMBIENT = ['FRONTEND_URL', 'ALLOWED_ORIGINS', 'NODE_ENV'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of AMBIENT) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of AMBIENT) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const build = (env: Record<string, string>) =>
  new SecurityConfigBuilder(new ConfigService(env)).build();

describe('SecurityConfigBuilder origins (#1959)', () => {
  it('defaults to the Ingress origin, http://localhost, when nothing is configured', () => {
    const config = build({ NODE_ENV: 'production' });

    expect(config.cors.origin).toEqual(['http://localhost']);
    expect(config.helmet.contentSecurityPolicy.directives.connectSrc).toContain('http://localhost');
  });

  it('lets ALLOWED_ORIGINS override FRONTEND_URL, trimming each entry', () => {
    const config = build({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://erp.example.com',
      ALLOWED_ORIGINS: 'https://erp.example.com, https://erp-admin.example.com',
    });

    expect(config.cors.origin).toEqual(['https://erp.example.com', 'https://erp-admin.example.com']);
  });

  it('falls back to FRONTEND_URL when ALLOWED_ORIGINS is unset', () => {
    const config = build({ NODE_ENV: 'production', FRONTEND_URL: 'https://erp.example.com' });

    expect(config.cors.origin).toEqual(['https://erp.example.com']);
  });
});
