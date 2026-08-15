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
      connection: {
        host: 'redis-host',
        port: 6390,
        password: 'secret',
        protocol: 2,
      },
    });
  });

  it('falls back to the compose defaults', () => {
    const options = createBullOptions();
    const factory = options.useFactory as (c: ConfigService) => any;

    expect(factory(configWith({}))).toEqual({
      connection: {
        host: 'redis',
        port: 6379,
        password: undefined,
        protocol: 2,
      },
    });
  });

  /**
   * ioredis 6 defaults to RESP3. BullMQ 6.1.1 declares `ioredis: >=5.0.0` but
   * pins 5.11.1 as its devDependency, so RESP3 is untested for the queue layer
   * and reply shapes are protocol-dependent (zrange returns string[] under
   * RESP2, [member, score][] under RESP3). This asserts the pin directly so
   * dropping it fails with a message about the protocol rather than showing up
   * as an incidental diff in a connection-shape assertion.
   */
  it('pins RESP2 so ioredis 6 does not negotiate RESP3', () => {
    const options = createBullOptions();
    const factory = options.useFactory as (c: ConfigService) => any;

    expect(factory(configWith({})).connection.protocol).toBe(2);
  });

  it('injects ConfigService', () => {
    expect(createBullOptions().inject).toEqual([ConfigService]);
  });
});