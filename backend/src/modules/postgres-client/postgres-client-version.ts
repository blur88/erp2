import { execFile } from 'node:child_process';

/** Reads `pg_dump --version`. Injected so tests never spawn a process. */
export const PG_DUMP_VERSION_READER = Symbol('PG_DUMP_VERSION_READER');

const pgDumpVersion = /^pg_dump \(PostgreSQL\) (\d+)/;
const serverVersionNum = /^\d+$/;

/** `pg_dump (PostgreSQL) 19.0 (Debian ...)` -> 19. Undefined for anything else. */
export function parsePgDumpMajor(output: string): number | undefined {
  const major = pgDumpVersion.exec(output.trim())?.[1];
  return major === undefined ? undefined : Number(major);
}

/**
 * `server_version_num` is `MMmmpp` for PostgreSQL 10 and later (190000 -> 19).
 * Undefined when the value is not a server version number.
 */
export function serverMajorFromVersionNum(versionNum: string): number | undefined {
  if (!serverVersionNum.test(versionNum)) return undefined;
  const major = Math.floor(Number(versionNum) / 10000);
  return major > 0 ? major : undefined;
}

export function readPgDumpVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('pg_dump', ['--version'], { timeout: 5000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}
