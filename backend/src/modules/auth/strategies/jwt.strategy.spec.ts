import { describe, it, expect, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { UserStatus } from '../../../database/entities/user.entity';

describe('Session access tokens', () => {
  const user = {
    id: 'user',
    tokenVersion: 3,
    isActive: true,
    status: UserStatus.ACTIVE,
    isLocked: false,
  };
  const strategy = () =>
    new JwtStrategy(new ConfigService({ JWT_SECRET: 'test-secret' }), {
      findOne: jest.fn<() => Promise<any>>().mockResolvedValue(user),
    } as any);
  it.each([undefined, null, '3', 3.5, 2])(
    'rejects ended or malformed version %s',
    async (tokenVersion) => {
      await expect(
        strategy().validate({ sub: 'user', tokenVersion } as any),
      ).rejects.toThrow('Session has ended');
    },
  );
  it('accepts the current version', async () => {
    await expect(
      strategy().validate({ sub: 'user', tokenVersion: 3 } as any),
    ).resolves.toMatchObject({ userId: 'user' });
  });
});
