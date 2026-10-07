import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';

export const SESSION_PROTOCOL_HEADER = 'x-erp-session-protocol';
export const SESSION_PROTOCOL_VERSION = '2';

@Injectable()
export class SessionProtocolGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const value = request.headers?.[SESSION_PROTOCOL_HEADER];

    if (value !== SESSION_PROTOCOL_VERSION) {
      throw new HttpException(
        {
          message: 'This page is out of date. Reload to continue.',
          code: 'CLIENT_RELOAD_REQUIRED',
        },
        426,
      );
    }

    return true;
  }
}
