import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const directory = process.argv[2];
if (!directory) {
  console.error('Usage: node scripts/run-node-tests.mjs <dir>');
  process.exit(1);
}

const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap'], {
  cwd: resolve(directory),
  encoding: 'utf8',
  env,
});
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
const count = result.stdout?.match(/^# tests (\d+)\s*$/m);
if (!count || Number(count[1]) === 0) {
  console.error('No tests discovered');
  process.exitCode = 1;
}
