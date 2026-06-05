import { ErrorSanitizerService } from "./error-sanitizer.service";

describe("ErrorSanitizerService", () => {
  let service: ErrorSanitizerService;

  beforeEach(() => {
    service = new ErrorSanitizerService();
  });

  describe("sanitizeUserAgent", () => {
    it("replaces three-part version numbers", () => {
      const ua = "Mozilla/5.0 AppleWebKit/537.36.0 Chrome/120.0.6099";
      expect(service.sanitizeUserAgent(ua)).toBe(
        "Mozilla/5.0 AppleWebKit/x.x.x Chrome/x.x.x",
      );
    });

    it("returns [UNKNOWN] for empty string", () => {
      expect(service.sanitizeUserAgent("")).toBe("[UNKNOWN]");
    });

    it("returns [USER_AGENT_TOO_LONG] for string over 1000 chars", () => {
      expect(service.sanitizeUserAgent("a".repeat(1001))).toBe(
        "[USER_AGENT_TOO_LONG]",
      );
    });

    it("returns [UNKNOWN] for null input", () => {
      expect(service.sanitizeUserAgent(null as any)).toBe("[UNKNOWN]");
    });

    it("returns [UNKNOWN] for undefined input", () => {
      expect(service.sanitizeUserAgent(undefined as any)).toBe("[UNKNOWN]");
    });

    it("applies regex to a string of exactly 1000 chars", () => {
      const ua = `${"a".repeat(995)}1.2.3`;
      expect(ua).toHaveLength(1000);
      const result = service.sanitizeUserAgent(ua);
      expect(result).not.toBe("[USER_AGENT_TOO_LONG]");
      expect(result).toContain("x.x.x");
    });

    it("handles ReDoS input without hanging", () => {
      const malicious = `1.${"1".repeat(1000)}`;
      const start = Date.now();
      const result = service.sanitizeUserAgent(malicious);
      expect(result).toBe("[USER_AGENT_TOO_LONG]");
      expect(Date.now() - start).toBeLessThan(50);
    });
  });

  describe("sanitizePath", () => {
    it("redacts sensitive query params", () => {
      expect(service.sanitizePath("/api?password=secret&token=abc")).toBe(
        "/api?password=[REDACTED]&token=[REDACTED]",
      );
    });

    it("returns [UNKNOWN_PATH] for empty string", () => {
      expect(service.sanitizePath("")).toBe("[UNKNOWN_PATH]");
    });
  });

  describe("sanitizeIP", () => {
    it("masks last octet of IPv4", () => {
      expect(service.sanitizeIP("192.168.1.100")).toBe("192.168.1.xxx");
    });

    it("returns [UNKNOWN] for empty string", () => {
      expect(service.sanitizeIP("")).toBe("[UNKNOWN]");
    });
  });

  describe("sanitizeErrorMessage", () => {
    it("redacts auth credential fields", () => {
      expect(service.sanitizeErrorMessage("password=secret123")).toBe(
        "password=[REDACTED]",
      );
    });

    it("redacts DB table names", () => {
      expect(service.sanitizeErrorMessage('table "users" violates')).toBe(
        'table "[TABLE]" violates',
      );
    });

    it("redacts DB column names", () => {
      expect(service.sanitizeErrorMessage('column "email" of')).toBe(
        'column "[COLUMN]" of',
      );
    });

    it("redacts DB constraint names", () => {
      expect(
        service.sanitizeErrorMessage('constraint "uq_email" violated'),
      ).toBe('constraint "[CONSTRAINT]" violated');
    });

    it("returns [INVALID_MESSAGE] for non-string input", () => {
      expect(service.sanitizeErrorMessage(null as any)).toBe(
        "[INVALID_MESSAGE]",
      );
    });

    it("returns [MESSAGE_TOO_LONG] for messages over 5000 chars", () => {
      expect(service.sanitizeErrorMessage("a".repeat(5001))).toBe(
        "[MESSAGE_TOO_LONG]",
      );
    });
  });

  describe("containsSensitiveInfo", () => {
    it("detects auth credential patterns", () => {
      expect(service.containsSensitiveInfo("password: hunter2")).toBe(true);
    });

    it("detects DB schema patterns", () => {
      expect(service.containsSensitiveInfo('table "products"')).toBe(true);
    });

    it("returns false for benign messages", () => {
      expect(service.containsSensitiveInfo("record not found")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(service.containsSensitiveInfo("")).toBe(false);
    });

    it("returns true for messages over 5000 chars", () => {
      expect(service.containsSensitiveInfo("a".repeat(5001))).toBe(true);
    });
  });

  describe("sanitizeStackTrace", () => {
    it("limits to 5 lines by default", () => {
      const stack = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n");
      const result = service.sanitizeStackTrace(stack);
      expect(result.split("\n")).toHaveLength(5);
    });

    it("replaces file paths", () => {
      const stack = "Error\n    at /home/user/app/src/file.ts:10:5";
      expect(service.sanitizeStackTrace(stack)).toContain("[PATH]");
    });

    it("returns [NO_STACK] for empty input", () => {
      expect(service.sanitizeStackTrace("")).toBe("[NO_STACK]");
    });
  });
});
