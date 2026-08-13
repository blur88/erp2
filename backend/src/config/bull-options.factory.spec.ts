import { ConfigService } from '@nestjs/config';
import { createBullOptions } from './bull-options.factory';

describe('createBullOptions', () => {
  const configWith = (values: Record<string, string | undefined>) =>
    ({
      get: (key: string, fallback?: string) => values[key] ?? fallback,
    }) as unknown as ConfigService;

  it('resolves connection settings from ConfigService', () => {
    const options = createBullOptions();
    const factory = options.useFactory as (c: ConfigService) => any;

    expect(
      factory(
        configWith({
          REDIS_HOST: 'redis-host',
          REDIS_PORT: '6390',
          REDIS_PASSWORD: 'secret',
        }),
      ),
    ).toEqual({
      connection: { host: 'redis-host', port: 6390, password: 'secret' },
    });
  });

  it('falls back to the compose defaults', () => {
    const options = createBullOptions();
    const factory = options.useFactory as (c: ConfigService) => any;

    expect(factory(configWith({}))).toEqual({
      connection: { host: 'redis', port: 6379, password: undefined },
    });
  });

  it('injects ConfigService', () => {
    expect(createBullOptions().inject).toEqual([ConfigService]);
  });
});