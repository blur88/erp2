import { Injectable } from '@nestjs/common';

export type AuthUserLockOperation =
  'login' | 'refresh' | 'signOut' | 'changePassword';

/** Observable lock boundary; production deliberately does no work here. */
@Injectable()
export class AuthUserLockHook {
  async afterUserLock(
    _operation: AuthUserLockOperation,
    _userId: string,
  ): Promise<void> {}
}
