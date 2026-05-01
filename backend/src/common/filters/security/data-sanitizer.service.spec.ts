import { DataSanitizerService } from './data-sanitizer.service';

describe('DataSanitizerService', () => {
  let service: DataSanitizerService;

  beforeEach(() => {
    service = new DataSanitizerService();
  });

  describe('sanitizeUserAgent', () => {
    it('replaces three-part version numbers in a normal UA string', () => {
      const ua =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36.0 Chrome/120.0.6099 Safari/537.36.0';

      expect(service.sanitizeUserAgent(ua)).toBe(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/x.x.x Chrome/x.x.x Safari/x.x.x',
      );
    });

    it('returns [UNKNOWN] for empty string', () => {
      expect(service.sanitizeUserAgent('')).toBe('[UNKNOWN]');
    });

    it('returns [UNKNOWN] for null/undefined', () => {
      expect(service.sanitizeUserAgent(null as any)).toBe('[UNKNOWN]');
      expect(service.sanitizeUserAgent(undefined as any)).toBe('[UNKNOWN]');
    });

    it('applies regex to a string of exactly 1000 chars', () => {
      const ua = `${'a'.repeat(995)}1.2.3`;

      const result = service.sanitizeUserAgent(ua);

      expect(ua).toHaveLength(1000);
      expect(result).not.toBe('[USER_AGENT_TOO_LONG]');
      expect(result).toContain('x.x.x');
    });

    it('returns [USER_AGENT_TOO_LONG] for a string of 1001 chars', () => {
      const ua = 'a'.repeat(1001);

      expect(service.sanitizeUserAgent(ua)).toBe('[USER_AGENT_TOO_LONG]');
    });

    it('returns [USER_AGENT_TOO_LONG] for a crafted ReDoS input without hanging', () => {
      const malicious = `1.${'1'.repeat(1000)}`;
      const start = Date.now();

      const result = service.sanitizeUserAgent(malicious);
      const elapsed = Date.now() - start;

      expect(result).toBe('[USER_AGENT_TOO_LONG]');
      expect(elapsed).toBeLessThan(50);
    });
  });
});
