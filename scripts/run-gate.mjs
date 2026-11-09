#!/usr/bin/env node
// Runs one gate command and saves a self-describing evidence log (#1774).
// Usage: node scripts/run-gate.mjs <log> -- <command> [args...]
// The command runs from the current directory without a shell; wrap it in `sh -c` to use shell syntax.
//
// Log layout:
//   header  HEAD, TREE (git status before the command runs), CWD and ARGV (JSON-encoded), STARTED
//   output  combined stdout/stderr bytes, between `--- output ---` and the last `--- end output ---`
//   footer  optional SIGNAL= or a start-failure note, then FINISHED, TAP, and EXIT as the final line
// Read the footer after the last `--- end output ---`: the command's own output can contain any text.
// TAP counts unindented `ok`/`not ok`/`1..N` (including `1..0 # SKIP`) lines of stdout only, so stderr can't split or add to them.
// The wrapper exits with the command's status: 128 + n for signal n, 127 when the command is missing,
// 126 when it can't be started. Wrapper errors (usage, an existing or uncreatable log) print `run-gate:`
// or `Usage:` on stderr, exit 125 and create no log. SIGHUP/SIGINT/SIGTERM sent to the wrapper are forwarded to the command.
// HEAD and TREE describe the repository Git resolves from the current directory (including GIT_DIR).
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
const status = git('status', '--porcelain', '--untracked-files=all');
const tree = status === null ? 'unknown' : status === '' ? 'clean' : `dirty (${status.split('\n').length} paths)`;

let fd;
try {
  fd = openSync(log, 'wx');
} catch (error) {
  const reason = error.code === 'EEXIST' ? 'log already exists; evidence is never overwritten' : error.message;
  console.error(`run-gate: cannot create ${log}: ${reason}`);
  process.exit(WRAPPER_ERROR);
}

const write = (data) => writeSync(fd, data);
write(`# run-gate\nHEAD=${head}\nTREE=${tree}\nCWD=${JSON.stringify(process.cwd())}\n`);
write(`ARGV=${JSON.stringify([command, ...args])}\nSTARTED=${new Date().toISOString()}\n--- output ---\n`);

// A caller that stops reading (for example `| head`) must not cost the log its footer.
for (const stream of [process.stdout, process.stderr]) stream.on('error', () => {});

const tap = { plans: [], ok: 0, notOk: 0 };
let pendingLine = '';
function countTapLine(line) {
  if (/^1\.\.\d+(?:\s|$)/.test(line)) tap.plans.push(line.trimEnd());
  else if (/^ok(?:\s|$)/.test(line)) tap.ok += 1;
  else if (/^not ok(?:\s|$)/.test(line)) tap.notOk += 1;
}
function countTap(text) {
  const lines = (pendingLine + text).split('\n');
  // Only a line's start can match, so a long unterminated line keeps a short prefix.
  pendingLine = lines.pop().slice(0, 64);
  for (const line of lines) countTapLine(line);
}

let lastByte = 0x0a;
function capture(stream, parse) {
  return (chunk) => {
    write(chunk);
    lastByte = chunk[chunk.length - 1];
    // latin1 maps bytes 1:1, so a multibyte character split across chunks can't disturb line starts.
    if (parse) countTap(chunk.toString('latin1'));
    if (!stream.destroyed) stream.write(chunk);
  };
}

let finished = false;
function finish(exitStatus, note) {
  // A failed spawn emits 'error' and may also emit 'close'; record only the first outcome.
  if (finished) return;
  finished = true;
  if (pendingLine) countTapLine(pendingLine);
  if (lastByte !== 0x0a) write('\n');
  write('--- end output ---\n');
  if (note) write(`${note}\n`);
  const summary = tap.plans.length ? `${tap.plans.join(',')} ok=${tap.ok} not_ok=${tap.notOk}` : 'none';
  write(`FINISHED=${new Date().toISOString()}\nTAP=${summary}\nEXIT=${exitStatus}\n`);
  closeSync(fd);
  process.exitCode = exitStatus;
}

const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', capture(process.stdout, true));
child.stderr.on('data', capture(process.stderr, false));
for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  const message = `run-gate: cannot run ${command}: ${error.message}`;
  console.error(message);
  finish(error.code === 'ENOENT' ? 127 : 126, message);
});
child.on('close', (code, signal) => {
  if (signal) finish(128 + (constants.signals[signal] ?? 0), `SIGNAL=${signal}`);
  else finish(code ?? 1);
});
