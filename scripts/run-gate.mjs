#!/usr/bin/env node
// Runs one gate command and saves a self-describing evidence log (#1774).
// Usage: node scripts/run-gate.mjs <log> -- <command> [args...]
// The command runs from the current directory without a shell; wrap it in `sh -c` to use shell syntax.
// The log header records HEAD, tree state, cwd, argv and start time; the footer records the finish time,
// unindented TAP plan/ok/not-ok counts and EXIT=<status>. The wrapper exits with that status.
// Wrapper errors (usage, an existing log) exit 125 and never overwrite evidence.
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, openSync, writeSync } from 'node:fs';
import { constants } from 'node:os';

const WRAPPER_ERROR = 125;
const [log, separator, command, ...args] = process.argv.slice(2);
if (!log || separator !== '--' || !command) {
  console.error('Usage: node scripts/run-gate.mjs <log> -- <command> [args...]');
  process.exit(WRAPPER_ERROR);
}

function git(...gitArgs) {
  try {
    return execFileSync('git', gitArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trimEnd();
  } catch {
    return null;
  }
}

const head = git('rev-parse', 'HEAD') ?? 'unknown';
const status = git('status', '--porcelain');
const tree = status === null ? 'unknown' : status === '' ? 'clean' : `dirty (${status.split('\n').length} paths)`;

let fd;
try {
  fd = openSync(log, 'wx');
} catch (error) {
  const reason = error.code === 'EEXIST' ? 'log already exists; evidence is never overwritten' : error.message;
  console.error(`run-gate: cannot create ${log}: ${reason}`);
  process.exit(WRAPPER_ERROR);
}

const write = (text) => writeSync(fd, text);
write(`# run-gate\nHEAD=${head}\nTREE=${tree}\nCWD=${process.cwd()}\nARGV=${JSON.stringify([command, ...args])}\n`);
write(`STARTED=${new Date().toISOString()}\n--- output ---\n`);

// Decode once at the end so a multibyte character split across chunks stays intact.
const chunks = [];
function capture(stream) {
  return (chunk) => {
    chunks.push(chunk);
    write(chunk);
    stream.write(chunk);
  };
}

let finished = false;
function finish(exitStatus, note) {
  // A failed spawn emits 'error' and may also emit 'close'; record only the first outcome.
  if (finished) return;
  finished = true;
  const output = Buffer.concat(chunks).toString('utf8');
  if (output && !output.endsWith('\n')) write('\n');
  write('--- end output ---\n');
  if (note) write(`${note}\n`);
  const plans = output.match(/^1\.\.\d+/gm) ?? [];
  const ok = output.match(/^ok\b/gm)?.length ?? 0;
  const notOk = output.match(/^not ok\b/gm)?.length ?? 0;
  const tap = plans.length ? `${plans.join(',')} ok=${ok} not_ok=${notOk}` : 'none';
  write(`FINISHED=${new Date().toISOString()}\nTAP=${tap}\nEXIT=${exitStatus}\n`);
  closeSync(fd);
  process.exitCode = exitStatus;
}

const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', capture(process.stdout));
child.stderr.on('data', capture(process.stderr));
child.on('error', (error) => {
  const message = `run-gate: cannot run ${command}: ${error.message}`;
  console.error(message);
  finish(error.code === 'ENOENT' ? 127 : 126, message);
});
child.on('close', (code, signal) => {
  if (signal) finish(128 + (constants.signals[signal] ?? 0), `SIGNAL=${signal}`);
  else finish(code ?? 1);
});
