import { parsePgDumpMajor, serverMajorFromVersionNum } from './postgres-client-version';

describe('parsePgDumpMajor', () => {
  it.each([
    ['pg_dump (PostgreSQL) 19.0', 19],
    ['pg_dump (PostgreSQL) 19.0 (Debian 19.0-1.pgdg)', 19],
    ['pg_dump (PostgreSQL) 18.3\n', 18],
  ])('reads the major version from %j', (output, major) => {
    expect(parsePgDumpMajor(output)).toBe(major);
  });

  it.each(['psql (PostgreSQL) 19.0', '', 'pg_dump: command not found'])(
    'rejects output that is not pg_dump version text: %j',
    (output) => {
      expect(parsePgDumpMajor(output)).toBeUndefined();
    },
  );
});

describe('serverMajorFromVersionNum', () => {
  it.each([
    ['190000', 19],
    ['190001', 19],
    ['170004', 17],
  ])('reads the major from server_version_num %s', (versionNum, major) => {
    expect(serverMajorFromVersionNum(versionNum)).toBe(major);
  });

  it.each(['', 'abc', '0'])('rejects an unusable value %j', (versionNum) => {
    expect(serverMajorFromVersionNum(versionNum)).toBeUndefined();
  });
});
