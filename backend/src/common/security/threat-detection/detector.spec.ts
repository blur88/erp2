import { BadRequestException } from '@nestjs/common';
import { ThreatDetector } from './detector';
import { SecurityLogger } from '../logging/security-logger';

const mockLogger = {
  logThreatDetection: jest.fn(),
  logError: jest.fn(),
} as unknown as SecurityLogger;

const mockReq = {
  path: '/test',
  method: 'POST',
  ip: '127.0.0.1',
  headers: { 'user-agent': 'jest' },
} as any;

describe('ThreatDetector', () => {
  let detector: ThreatDetector;

  beforeEach(() => {
    jest.clearAllMocks();
    detector = new ThreatDetector(mockLogger);
  });

  describe('XSS detection', () => {
    it('passes clean input without throwing', () => {
      expect(() =>
        detector.detectThreats({ name: 'Widget A' }, 'body', mockReq),
      ).not.toThrow();
    });

    it('blocks <script> tag', () => {
      expect(() =>
        detector.detectThreats(
          { name: '<script>alert(1)</script>' },
          'body',
          mockReq,
        ),
      ).toThrow(BadRequestException);
    });

    it('logs before throwing on XSS', () => {
      expect(() =>
        detector.detectThreats(
          { name: '<script>alert(1)</script>' },
          'body',
          mockReq,
        ),
      ).toThrow();
      expect(mockLogger.logThreatDetection).toHaveBeenCalledWith(
        expect.objectContaining({
          threats: expect.stringContaining('CRITICAL_XSS'),
        }),
      );
    });

    it('blocks <img onerror> XSS vector', () => {
      expect(() =>
        detector.detectThreats(
          { note: '<img src=x onerror=alert(1)>' },
          'body',
          mockReq,
        ),
      ).toThrow(BadRequestException);
    });

    it('passes already-encoded HTML entities', () => {
      expect(() =>
        detector.detectThreats(
          { note: '&lt;script&gt;alert(1)&lt;/script&gt;' },
          'body',
          mockReq,
        ),
      ).not.toThrow();
    });

    it('passes plain text with no HTML', () => {
      expect(() =>
        detector.detectThreats(
          { description: 'Price is 10 < 20 and cost > 5' },
          'body',
          mockReq,
        ),
      ).not.toThrow();
    });

    // javascript: URIs in plain text strings are not HTML and are not stripped by
    // sanitize-html. Blocking them is out of scope for this fix (see spec).
    it('passes javascript: URI as plain text (out of scope for this fix)', () => {
      expect(() =>
        detector.detectThreats(
          { note: 'javascript:alert(1)' },
          'body',
          mockReq,
        ),
      ).not.toThrow();
    });
  });

  describe('SQL injection detection (log-only, no throw)', () => {
    it('does not throw on SQL injection patterns', () => {
      expect(() =>
        detector.detectThreats({ search: "' OR 1=1" }, 'body', mockReq),
      ).not.toThrow();
    });

    it('logs SQL injection detection', () => {
      detector.detectThreats(
        { search: 'UNION SELECT * FROM users' },
        'body',
        mockReq,
      );
      expect(mockLogger.logThreatDetection).toHaveBeenCalledWith(
        expect.objectContaining({
          threats: expect.stringContaining('CRITICAL_SQL_INJECTION'),
        }),
      );
    });
  });

  describe('nested object traversal', () => {
    it('detects XSS in nested object', () => {
      expect(() =>
        detector.detectThreats(
          { product: { description: '<script>alert(1)</script>' } },
          'body',
          mockReq,
        ),
      ).toThrow(BadRequestException);
    });

    it('detects XSS in array element', () => {
      expect(() =>
        detector.detectThreats(
          { tags: ['safe', '<script>x</script>'] },
          'body',
          mockReq,
        ),
      ).toThrow(BadRequestException);
    });
  });
});
