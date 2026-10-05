import { AuthSessionService } from '../../src/modules/auth/auth-session.service';

describe('AuthSessionService (unit)', () => {
  const mockRefreshKeys: any = {
    activeKid: 'k1',
    secretFor: () => 'mock-secret',
    kids: () => ['k1'],
  };
  const mockClock: any = { now: () => new Date() };
  const mockJwtService: any = {};
  const mockDataSource: any = {};
  const mockSessionRepo: any = {};
  const mockTokenRepo: any = {};
  const mockUserRepo: any = {};
  const mockReplayAuditWriter: any = { write: () => Promise.resolve() };

  function createService(refreshExpiry?: string): AuthSessionService {
    const mockConfigService: any = {
      get: (key: string, defaultVal?: any) => {
        if (key === 'JWT_REFRESH_TOKEN_EXPIRY') {
          return refreshExpiry;
        }
        return defaultVal;
      },
    };
    return new AuthSessionService(
      mockRefreshKeys,
      mockClock,
      mockConfigService,
      mockJwtService,
      mockDataSource,
      mockSessionRepo,
      mockTokenRepo,
      mockUserRepo,
      mockReplayAuditWriter,
    );
  }

  it('unset gives 172800 (rememberMe: false) and 604800 (rememberMe: true)', () => {
    const service = createService(undefined);
    expect(service.refreshLifetimeSeconds(false)).toBe(172800);
    expect(service.refreshLifetimeSeconds(true)).toBe(604800);
  });

  it("'' gives the same (172800 and 604800)", () => {
    const service = createService('');
    expect(service.refreshLifetimeSeconds(false)).toBe(172800);
    expect(service.refreshLifetimeSeconds(true)).toBe(604800);
  });

  it("'12h' gives 43200 for both", () => {
    const service = createService('12h');
    expect(service.refreshLifetimeSeconds(false)).toBe(43200);
    expect(service.refreshLifetimeSeconds(true)).toBe(43200);
  });

  it.each(['abc', '0d'])("rejects invalid expiry '%s'", (invalidExpiry) => {
    expect(() => createService(invalidExpiry)).toThrow(/JWT_REFRESH_TOKEN_EXPIRY/);
  });
});
