import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PostgresClientStatusService } from './postgres-client-status.service';

function build({
  clientOutput = 'pg_dump (PostgreSQL) 19.0',
  serverVersionNum = '190000',
  clientError,
  queryError,
}: {
  clientOutput?: string;
  serverVersionNum?: string;
  clientError?: Error;
  queryError?: Error;
} = {}) {
  const query = jest.fn(async () => {
    if (queryError) throw queryError;
    return [{ version: serverVersionNum }];
  });
  const dataSource = { query } as unknown as DataSource;
  const readClientVersion = jest.fn(async () => {
    if (clientError) throw clientError;
    return clientOutput;
  });
  return {
    service: new PostgresClientStatusService(dataSource, readClientVersion),
    query,
    readClientVersion,
  };
}

describe('PostgresClientStatusService', () => {
  let errorLog: jest.SpiedFunction<typeof Logger.prototype.error>;
  let warnLog: jest.SpiedFunction<typeof Logger.prototype.warn>;

  beforeEach(() => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    warnLog = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is unchecked until the bootstrap check runs', () => {
    const { service } = build();
    expect(service.getStatus()).toEqual({ state: 'unchecked' });
  });

  it('reports compatible when pg_dump and the server share a major version', async () => {
    const { service } = build({ clientOutput: 'pg_dump (PostgreSQL) 19.0', serverVersionNum: '190000' });

    await expect(service.check()).resolves.toEqual({ state: 'compatible', clientMajor: 19, serverMajor: 19 });
    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog).not.toHaveBeenCalled();
  });

  it('logs an error and flags a mismatch without throwing', async () => {
    const { service } = build({ clientOutput: 'pg_dump (PostgreSQL) 19.0', serverVersionNum: '180003' });

    await expect(service.check()).resolves.toEqual({ state: 'mismatch', clientMajor: 19, serverMajor: 18 });
    expect(service.getStatus()).toEqual({ state: 'mismatch', clientMajor: 19, serverMajor: 18 });
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('pg_dump 19 does not match the server 18'));
  });

  it('reports unavailable when pg_dump cannot run', async () => {
    const { service } = build({ clientError: new Error('spawn pg_dump ENOENT') });

    const status = await service.check();
    expect(status).toEqual({ state: 'unavailable', reason: 'pg_dump could not run' });
    expect(warnLog).toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('reports unavailable when pg_dump prints an unrecognised version', async () => {
    const { service } = build({ clientOutput: 'not a version' });

    await expect(service.check()).resolves.toEqual({
      state: 'unavailable',
      reason: 'pg_dump printed an unrecognised version',
    });
  });

  it('reports unavailable when the server version cannot be read', async () => {
    const { service } = build({ queryError: new Error('connection refused') });

    await expect(service.check()).resolves.toEqual({
      state: 'unavailable',
      reason: 'server version query failed',
    });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('runs the check when the application bootstraps', async () => {
    const { service, readClientVersion } = build();

    await service.onApplicationBootstrap();

    expect(readClientVersion).toHaveBeenCalledTimes(1);
    expect(service.getStatus().state).toBe('compatible');
  });
});
