import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env.test', import.meta.url) });

describe('inspect 1398 project 2 connectivity', () => {
  it('psql container reaches the e2e database', () => {
    const output = execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'host',
        '-e',
        'PGPASSWORD',
        'postgres:18.3-alpine3.23',
        'psql',
        '-X',
        '-At',
        '-h',
        process.env.DB_HOST || 'localhost',
        '-p',
        process.env.DB_PORT || '5432',
        '-U',
        process.env.DB_USERNAME || 'erp_user',
        '-d',
        process.env.DB_DATABASE || 'erp_db_test',
        '-c',
        'select current_database()',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD },
      },
    );

    expect(output.trim()).toBe('erp_db_test');
  });
});
