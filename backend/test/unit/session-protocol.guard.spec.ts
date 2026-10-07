import { ExecutionContext, HttpException } from '@nestjs/common';
import {
  SessionProtocolGuard,
  SESSION_PROTOCOL_HEADER,
  SESSION_PROTOCOL_VERSION,
} from '@/modules/auth/guards/session-protocol.guard';

function contextWith(headers: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('SessionProtocolGuard', () => {
  const guard = new SessionProtocolGuard();

  it('allows the exact supported version', () => {
    expect(guard.canActivate(contextWith({ [SESSION_PROTOCOL_HEADER]: SESSION_PROTOCOL_VERSION }))).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['1', '1'],
    ['trailing space', '2 '],
    ['leading zero', '02'],
    ['array value', ['2']],
  ])('rejects a %s header with 426 and CLIENT_RELOAD_REQUIRED', (_name, value) => {
    let thrown: HttpException | undefined;
    try {
      guard.canActivate(contextWith({ [SESSION_PROTOCOL_HEADER]: value }));
    } catch (error) {
      thrown = error as HttpException;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    expect(thrown?.getStatus()).toBe(426);
    const response = thrown?.getResponse() as { code?: string };
    expect(response.code).toBe('CLIENT_RELOAD_REQUIRED');
  });
});
