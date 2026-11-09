import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

const directory = process.argv[2];
if (!directory) {
  console.error('Usage: node scripts/run-node-tests.mjs <dir>');
  process.exit(1);
}

const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
const child = spawn(process.execPath, ['--test', '--test-reporter=tap'], {
  cwd: resolve(directory),
  stdio: ['inherit', 'pipe', 'inherit'],
  env,
});
let count = 0;
const lines = createInterface({ input: child.stdout });
lines.on('line', line => {
  const match = line.match(/^# tests (\d+)\s*$/);
  if (match) count = Number(match[1]);
});
child.stdout.pipe(process.stdout);
child.on('error', error => console.error(error.message));
child.on('close', status => {
  process.exitCode = status ?? 1;
  if (count === 0) {
    console.error('No tests discovered');
    process.exitCode = 1;
  }
});
