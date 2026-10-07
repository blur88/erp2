import { ConfigService } from '@nestjs/config';
import { SecurityConfigBuilder } from './security.config';

function build() {
  const config = new ConfigService({ NODE_ENV: 'production', FRONTEND_URL: 'https://erp.example.com' });
  return new SecurityConfigBuilder(config).build().cors;
}

describe('SecurityConfig CORS allowed headers', () => {
  it('names the session protocol header', () => {
    const cors = build();
    const lower = cors.allowedHeaders.map((h) => h.toLowerCase());
    expect(lower).toContain('x-erp-session-protocol');
  });

  it('still allows the seven existing headers', () => {
    const cors = build();
    expect(cors.allowedHeaders).toEqual(
      expect.arrayContaining([
        'Accept',
        'Accept-Language',
        'Content-Language',
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Range',
      ]),
    );
  });
});
