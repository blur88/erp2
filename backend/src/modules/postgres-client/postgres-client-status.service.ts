import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PG_DUMP_VERSION_READER, parsePgDumpMajor, serverMajorFromVersionNum } from './postgres-client-version';

export type PostgresClientStatus =
  | { state: 'unchecked' }
  | { state: 'compatible'; clientMajor: number; serverMajor: number }
  | { state: 'mismatch'; clientMajor: number; serverMajor: number }
  | { state: 'unavailable'; reason: string };

/**
 * Compares the PostgreSQL major version of the bundled pg_dump with the
 * database server at startup (#2110). A mismatch is logged and kept in
 * getStatus() for Backup operations to read. Nothing here throws, so the
 * application keeps serving requests whatever the outcome.
 */
@Injectable()
export class PostgresClientStatusService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PostgresClientStatusService.name);
  private status: PostgresClientStatus = { state: 'unchecked' };

  constructor(
    private readonly dataSource: DataSource,
    @Inject(PG_DUMP_VERSION_READER) private readonly readClientVersion: () => Promise<string>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.check();
  }

  getStatus(): PostgresClientStatus {
    return this.status;
  }

  async check(): Promise<PostgresClientStatus> {
    this.status = await this.evaluate();
    this.logStatus(this.status);
    return this.status;
  }

  private async evaluate(): Promise<PostgresClientStatus> {
    let clientMajor: number | undefined;
    try {
      clientMajor = parsePgDumpMajor(await this.readClientVersion());
    } catch {
      return { state: 'unavailable', reason: 'pg_dump could not run' };
    }
    if (clientMajor === undefined) {
      return { state: 'unavailable', reason: 'pg_dump printed an unrecognised version' };
    }

    let serverMajor: number | undefined;
    try {
      const [row] = await this.dataSource.query("SELECT current_setting('server_version_num') AS version");
      serverMajor = serverMajorFromVersionNum(String(row?.version ?? ''));
    } catch {
      serverMajor = undefined;
    }
    if (serverMajor === undefined) {
      return { state: 'unavailable', reason: 'server version query failed' };
    }

    return clientMajor === serverMajor
      ? { state: 'compatible', clientMajor, serverMajor }
      : { state: 'mismatch', clientMajor, serverMajor };
  }

  private logStatus(status: PostgresClientStatus): void {
    if (status.state === 'compatible') {
      this.logger.log(`PostgreSQL client and server are both major version ${status.serverMajor}`);
    } else if (status.state === 'mismatch') {
      this.logger.error(
        `PostgreSQL client mismatch: pg_dump ${status.clientMajor} does not match the server ${status.serverMajor}. ` +
          'Backups must not run until the backend image and the database image use the same major version.',
      );
    } else if (status.state === 'unavailable') {
      this.logger.warn(`PostgreSQL client version check skipped: ${status.reason}`);
    }
  }
}
