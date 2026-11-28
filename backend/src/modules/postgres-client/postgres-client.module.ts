import { Module } from '@nestjs/common';
import { PostgresClientStatusService } from './postgres-client-status.service';
import { PG_DUMP_VERSION_READER, readPgDumpVersion } from './postgres-client-version';

@Module({
  providers: [
    { provide: PG_DUMP_VERSION_READER, useValue: readPgDumpVersion },
    PostgresClientStatusService,
  ],
  exports: [PostgresClientStatusService],
})
export class PostgresClientModule {}
