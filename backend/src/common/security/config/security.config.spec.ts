import { ConfigService } from '@nestjs/config';
import { SecurityConfigBuilder } from './security.config';

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
