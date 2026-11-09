#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewState } from './review-state.mjs';
import { snapshot } from './review-snapshot.mjs';

const columns = ['round', 'kind', 'started', 'PR baseline', 'delta base', 'reviewed head', 'mode', 'outcome', 'blocking findings', 'report'];
const sha = /^[a-f0-9]{40}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const read = (file) => readFileSync(file, 'utf8');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const nn = (n) => String(n).padStart(2, '0');
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
const complete = (row) => /^complete(?:\b)/i.test(row.outcome);
const noBlocking = (value) => /^(?:0|none)(?:\b)/i.test(value);
const target = (value) => value.match(/\]\(([^)]+)\)/)?.[1] ?? value.replaceAll('`', '').trim();
function marker(file) {
  const text = read(file);
  if (text.trim().startsWith('{')) return JSON.parse(text);
  return Object.fromEntries(text.split('\n').filter((line) => line.includes(':')).map((line) => {
    const at = line.indexOf(':'); return [line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim()];
  }));
}
function reservations(key) {
  return readdirSync(key).filter((name) => /^round-\d+\.started$/.test(name)).map((name) => ({ number: Number(name.match(/\d+/)[0]), ...marker(join(key, name)) }));
}
function ledger(key, content) {
  const rows = [], errors = [];
  const file = join(key, 'reviews.md');
  if (content === undefined && !existsSync(file)) return { rows, errors: ['round N/A: missing reviews.md'] };
  let state = 0;
  for (const line of (content ?? read(file)).split('\n').filter((line) => line.trim())) {
    const values = cells(line);
    if (state === 0 && values.length === 10 && values.every((value, i) => value === columns[i] || value.startsWith(`${columns[i]} (`))) { state = 1; continue; }
    if (state === 1 && values.length === 10 && values.every((value) => /^:?-+:?$/.test(value))) { state = 2; continue; }
    if (state !== 2 || !/^\d+$/.test(values[0]) || values.length !== 10 || !line.trim().startsWith('|')) {
      errors.push(`round ${/^\d+$/.test(values[0]) ? values[0] : 'N/A'}: table: unexpected line or missing columns: ${line}`); continue;
    }
    rows.push(Object.fromEntries(columns.map((name, i) => [name, values[i]])));
  }
  if (state !== 2) errors.push('round N/A: table: missing header/separator');
  return { rows, errors };
}
function field(report, name) {
  return report.match(new RegExp(`(?:^|[;.\\n])\\s*(?:-\\s*)?(?:\\*\\*)?${name}(?:\\s*\\([^\\n)]*\\))?(?:\\*\\*)?:\\s*([^;\\n]+)`, 'im'))?.[1]?.replaceAll('`', '').trim();
}
export function check(key, content) {
  const { rows, errors } = ledger(key, content), warnings = [];
  let last, previous = 0, previousState;
  const states = [];
  const tableValid = errors.length === 0;
  for (const row of rows) {
    const errorStart = errors.length;
    const fail = (rule) => errors.push(`round ${row.round}: ${rule}`);
    const number = Number(row.round);
    if (number <= previous) fail('round numbers must be unique and increasing');
    previous = Math.max(previous, number);
    if (!['committed', 'working-tree', 'pre-merge', 'scope-reset'].includes(row.kind)) fail('invalid kind');
    if (!/^(complete|partial|aborted)\b/i.test(row.outcome)) fail('invalid outcome');
    for (const name of ['PR baseline', 'delta base', 'reviewed head']) {
      const value = row[name];
      if (!(sha.test(value) || value === 'N/A' || /^[a-f0-9]{40} \+ working tree$/.test(value) || (name === 'delta base' && /(?:saved.*(?:state|round)|round.*saved.*state|\.patch)/i.test(value)))) fail(`${name}: expected full SHA or documented saved state`);
    }
    let start;
    try {
      start = marker(join(key, `round-${nn(number)}.started`));
      if (!Number.isFinite(Date.parse(start.started)) || !/^\d{4}-\d\d-\d\dT/.test(start.started)) fail('marker started: expected ISO 8601');
      if (start.started !== row.started) fail('started differs from marker');
      if (!sha.test(start.head)) fail('marker head must be a full SHA');
      if (row['reviewed head'].replace(/ \+ working tree$/, '') !== start.head) fail('reviewed head differs from marker');
      if (!(uuid.test(start.session ?? '') || (/^(?:claude-code|codex)$/.test(start.harness ?? '') && /^[\w-]{16,}$/.test(start.session ?? '') && start.nativeId === start.session))) fail('marker session: invalid harness session ID or fallback identity');
      if (start.fallback && !(start.hostname && Number(start.pid) > 0 && uuid.test(start.session))) fail('marker session: fallback needs UUID, hostname and PID');
    } catch { fail('missing or invalid marker'); }
    const reportPath = resolve(key, target(row.report));
    if (!existsSync(reportPath)) { fail('report missing'); continue; }
    const report = read(reportPath);
    const history = rows.slice(0, rows.indexOf(row));
    const currentScope = history.slice(history.findLastIndex(r => r.kind === 'scope-reset') + 1);
    const priorWorking = currentScope.find((item) => item.kind === 'working-tree' && complete(item) && target(item.report) === target(row.report));
    let reconciled = false;
    if (row.kind === 'committed' && priorWorking) {
      const patch = join(key, `review-round-${nn(priorWorking.round)}.patch`);
      try {
        const committed = execFileSync('git', ['diff', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', row['PR baseline'], row['reviewed head'], '--'], { stdio: ['ignore', 'pipe', 'pipe'] });
        reconciled = priorWorking['PR baseline'] === row['PR baseline'] && readFileSync(patch).equals(committed);
      } catch { /* A missing patch or unresolved commit cannot establish reconciliation. */ }
      if (!reconciled) fail('committed reconciliation must match saved working-tree patch');
      if (!states.find(s => s.round === priorWorking.round)?.valid) fail('reconciliation requires a valid working-tree review');
      if (row['blocking findings'] !== priorWorking['blocking findings']) fail('committed reconciliation must carry working-tree blocking findings verbatim');
    }
    const plain = `review-${row['reviewed head']}.md`;
    const expected = row.kind === 'committed' ? plain : `review-round-${nn(number)}.md`;
    const alternate = `review-${row['reviewed head']}-round-${nn(number)}.md`;
    if (!reconciled && basename(reportPath) !== expected && !(row.kind === 'committed' && basename(reportPath) === alternate && existsSync(join(key, plain)))) fail('report name does not follow convention');
    const modified = statSync(reportPath).mtimeMs;
    if (!reconciled && start && modified < Date.parse(start.started)) fail('report predates marker');
    const reportTimes = [modified, ...[...report.matchAll(/\]\(([^)]+\.md)\)/g)].map((match) => resolve(dirname(reportPath), match[1])).filter(existsSync).map((file) => statSync(file).mtimeMs)];
    if (/subagents?/i.test(row.mode) && start && reportTimes.some((time) => time >= Date.parse(start.started) && time - Date.parse(start.started) < 60000)) warnings.push(`round ${row.round}: warning: subagent report written within 60 s of marker`);
    const fields = ['kind', 'PR baseline', 'delta base', 'reviewed head', 'working tree included', 'scope', 'mode'];
    for (const name of fields) if (!field(report, name)) fail(`report header missing ${name}`);
    if (!/(?:issue.*PR.*key|Issue:.*PR:.*key:|Issue\/key:.*PR:)/i.test(report)) fail('report header missing issue / PR / key');
    if (!/(?:round\s*(?:number)?\s*:?[ #]*0*\d+)/i.test(report)) fail('report header missing round number');
    if (!/verification|evidence check/i.test(report) || !/(?:passed|failed|pending|cancelled|not run|exit 0|\d+ ok)/i.test(report)) fail('report verification missing commands and report statuses');
    const reportRound = report.match(/round\s*(?:number)?\s*:?[ #]*0*(\d+)/i)?.[1];
    if (!reconciled && reportRound && Number(reportRound) !== number) fail('report round differs from ledger');
    if (!reconciled && field(report, 'kind') && !new RegExp(`^${row.kind}(?:[. ;]|$)`, 'i').test(field(report, 'kind'))) fail('report kind differs from ledger');
    for (const name of ['PR baseline', 'delta base', 'reviewed head']) {
      const value = field(report, name);
      if (!reconciled && value && !value.startsWith(row[name])) fail(`report ${name} differs from ledger`);
    }
    for (const line of report.split('\n')) {
      if (!/\b(?:passed|pending)\b/i.test(line)) continue;
      const links = [...line.matchAll(/\]\(([^)]+)\)|`([^`]+\.log)`/g)].map((match) => match[1] ?? match[2]);
      if (!links.length && /\bpending\b/i.test(line)) {
        for (const match of line.matchAll(/npm run ([\w:-]+)/g)) {
          const log = `evidence/${match[1].replaceAll(':', '-')}.log`;
          if (existsSync(resolve(key, log))) links.push(log);
        }
      }
      for (const link of links) {
        if (!/\.log$/.test(link)) continue;
        const logPath = resolve(dirname(reportPath), link);
        if (!existsSync(logPath)) { fail(`verification log missing: ${link}`); continue; }
        const log = read(logPath);
        const footer = log.slice(log.lastIndexOf('--- end output ---') + '--- end output ---'.length);
        const failed = /^\s*not ok\b/m.test(log) || (log.startsWith('# run-gate\n') ? /\nEXIT=[1-9]\d*\s*$/.test(footer) : /^EXIT=[1-9]\d*\s*$/m.test(log));
        if (failed) fail(`verification status contradicts saved log: ${link}`);
      }
    }
    if (row.kind === 'pre-merge') {
      if (last && row['PR baseline'] !== last['PR baseline']) fail('pre-merge baseline differs from committed review');
      if (!last || row['reviewed head'] !== last['reviewed head']) fail('pre-merge head must equal last reviewed commit');
      if (!/full PR|whole.PR/i.test(field(report, 'scope') ?? '')) fail('pre-merge scope must be full PR');
      if (start && last && Date.parse(start.started) < statSync(resolve(key, target(last.report))).mtimeMs) fail('pre-merge started before committed review completed');
    }
    const state = row.kind === 'scope-reset' ? undefined : reviewState({ key, row, report, previous: previousState, fail, reconciled, snapshotRound: priorWorking?.round });
    let inherited = reconciled;
    if (state?.scope === 'inherited' && !reconciled) {
      const origin = currentScope.find(r => Number(r.round) === state.inheritance?.round && r.kind === 'working-tree');
      const originState = states.find(s => s.round === origin?.round);
      try {
        if (!originState?.valid || !originState.coverage.complete || originState.coverage.scope !== 'full PR' || origin['PR baseline'] !== row['PR baseline']) throw Error();
        const snapshot = JSON.parse(read(join(key, `review-round-${nn(origin.round)}.snapshot.json`)));
        const patch = execFileSync('git', ['diff', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', row['PR baseline'], snapshot.tree, '--']);
        if (!patch.equals(readFileSync(join(key, `review-round-${nn(origin.round)}.patch`)))) throw Error();
        const difference = execFileSync('git', ['diff', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', snapshot.tree, row['reviewed head'], '--']);
        if (!difference.equals(readFileSync(resolve(key, state.inheritance.comparison)))) throw Error();
        inherited = true;
      } catch { fail('inherited coverage requires a valid full working-tree review and exact saved comparison'); }
    }
    if (state && !last && !inherited && state.scope !== 'full PR') fail('initial review requires full PR coverage');
    if (row.kind === 'committed' && last) {
      if (row['PR baseline'] !== last['PR baseline']) fail('baseline changed without scope reset');
      try { git('merge-base', '--is-ancestor', last['reviewed head'], row['reviewed head']); } catch { fail('last reviewed commit is not an ancestor'); }
      if (row['reviewed head'] === last['reviewed head'] && !reconciled && (!state?.rereview || String(state.rereview.round) !== String(Number(last.round)) || !state.rereview.authorization || !existsSync(resolve(key, state.rereview.authorization)))) fail('same-head re-review needs owner request and previous round');
      if (state?.scope === 'delta' && row['delta base'] !== last['reviewed head']) fail('delta base must equal last reviewed commit');
    }
    const valid = tableValid && errors.length === errorStart;
    states.push({ round: row.round, valid, completion: state?.completion ?? 'partial', coverage: state?.coverage ?? { scope: 'unknown', complete: false }, reuseEligible: valid && !!state?.reuseEligible, mergeEligible: valid && !!state?.mergeEligible });
    if (row.kind === 'scope-reset') { last = undefined; if (previousState) previousState = { findings: previousState.findings }; }
    if (valid && state && row.kind !== 'scope-reset') previousState = state;
    if (valid && state?.completion === 'complete' && row.kind === 'committed' && row['reviewed head'] !== last?.['reviewed head']) last = row;
  }
  let reserved = [];
  try { reserved = reservations(key).filter((item) => !rows.some((row) => Number(row.round) === item.number)); } catch (error) { errors.push(`round N/A: invalid reservation: ${error.message}`); }
  return { rows, errors, warnings, reserved, rounds: states, lastReviewedCommit: last?.['reviewed head'] ?? null };
}
function reserve(key) {
  mkdirSync(key, { recursive: true });
  const { rows } = ledger(key);
  const metadata = readdirSync(key).filter((name) => /^review.*\.md$/.test(name)).flatMap((name) => [...read(join(key, name)).matchAll(/round\s*:?[ #]*0*(\d+)/gi)].map((match) => Number(match[1])));
  let number = 1 + Math.max(0, ...rows.map((row) => Number(row.round)), ...reservations(key).map((item) => item.number), ...metadata);
  const native = process.env.CLAUDE_CODE_SESSION_ID ?? process.env.CODEX_SESSION_ID ?? process.env.CODEX_THREAD_ID;
  const harness = process.env.CLAUDE_CODE_SESSION_ID ? 'claude-code' : 'codex';
  for (;;) {
    const data = { session: native ?? randomUUID(), harness, nativeId: native ?? null, fallback: !native, hostname: hostname(), pid: process.pid, started: new Date().toISOString(), head: git('rev-parse', 'HEAD') };
    try { writeFileSync(join(key, `round-${nn(number)}.started`), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' }); console.log(`${nn(number)} ${data.started}`); return; }
    catch (error) { if (error.code !== 'EEXIST') throw error; number++; }
  }
}
function printCheck(result) {
  for (const message of [...result.errors, ...result.warnings]) console.log(message);
  for (const item of result.reserved) console.log(`round ${nn(item.number)}: reservation ${item.harness ?? 'unknown'} ${item.nativeId ?? item.session} ${item.started} ${item.head} host=${item.hostname ?? 'unknown'} pid=${item.pid ?? 'unknown'}`);
}
function record(key, number, json) {
  const data = JSON.parse(json), start = marker(join(key, `round-${nn(number)}.started`));
  const row = { ...data, round: nn(number), started: start.started, 'reviewed head': start.head + (data.kind === 'working-tree' ? ' + working tree' : '') };
  const values = columns.map((name) => row[name] ?? 'N/A');
  if (values.some((value) => /[|\n\r]/.test(String(value)))) throw Error('record fields cannot contain pipes or newlines');
  const file = join(key, 'reviews.md');
  const lock = join(key, '.record.lock');
  writeFileSync(lock, String(process.pid), { flag: 'wx' });
  try {
    const before = existsSync(file) ? read(file) : '';
    const content = before || `| ${columns.join(' | ')} |\n|${columns.map(() => '---').join('|')}|\n`;
    const line = `| ${values.join(' | ')} |\n`;
    const result = check(key, content + line); printCheck(result);
    if (result.errors.length) throw Error('invalid record; ledger unchanged');
    if (!before) writeFileSync(file, content, { flag: 'wx' });
    appendFileSync(file, line);
  } finally { unlinkSync(lock); }

}
function keyDirectory() {
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  const layout = git('config', '--local', '--get', 'review.scratchRoot');
  if (!['../.scratch', 'review-scratch'].includes(layout)) throw Error('initialize review.scratchRoot: docs/agents/code-review.md');
  const branch = git('branch', '--show-current');
  const issue = branch.match(/(?:^|[/_-])(\d+)(?:[/_-]|$)/)?.[1];
  return resolve(common, layout, issue ?? `branch-${branch.replace(/[^a-zA-Z0-9_-]/g, '-')}`);
}
function gateCreate() {
  const result = check(keyDirectory()); printCheck(result);
  if (result.errors.length || result.lastReviewedCommit !== git('rev-parse', 'HEAD')) throw Error('missing valid complete committed review for HEAD; docs/agents/code-review.md');
}
function merge(pr, ...flags) {
  if (!/^\d+$/.test(pr ?? '')) throw Error('merge requires a PR number');
  const head = JSON.parse(execFileSync('gh', ['pr', 'view', pr, '--json', 'headRefOid'], { encoding: 'utf8' })).headRefOid;
  if (flags.filter((flag) => flag === '--match-head-commit' || flag.startsWith('--match-head-commit=')).length !== 1 || flags.some((flag) => /^(?:--admin|--auto|--disable-auto)$/.test(flag))) throw Error('merge requires one exact head match and immediate checked merge');
  const index = flags.indexOf('--match-head-commit');
  if (index < 0 || flags[index + 1] !== head) throw Error('merge requires --match-head-commit with current PR head');
  const result = check(keyDirectory()); printCheck(result);
  const row = result.rows.at(-1);
  if (result.errors.length || row?.kind !== 'pre-merge' || !complete(row) || !noBlocking(row['blocking findings']) || !result.rounds.at(-1)?.mergeEligible || row['reviewed head'] !== head) throw Error('missing complete pre-merge review without blocking findings for current PR head; docs/agents/code-review.md');
  execFileSync('gh', ['pr', 'checks', pr, '--required', '--watch'], { stdio: 'inherit' });
  execFileSync('gh', ['pr', 'checks', pr, '--watch'], { stdio: 'inherit' });
  execFileSync('gh', ['pr', 'merge', pr, ...flags], { stdio: 'inherit' });
}
export function main([command, ...args]) {
  if (command === 'reserve') reserve(...args);
  else if (command === 'snapshot') snapshot(...args);
  else if (command === 'record') record(...args);
  else if (command === 'state') { const result = check(args[0]); console.log(JSON.stringify(result)); if (result.errors.length) process.exitCode = 1; }
  else if (command === 'status') printCheck({ ...check(args[0]), errors: [], warnings: [] });
  else if (command === 'note') appendFileSync(join(args[0], 'notes.md'), `\n- ${new Date().toISOString()} HEAD=${git('rev-parse', 'HEAD')}: ${args.slice(1).join(' ')}\n`);
  else if (command === 'compare') {
    const patch = execFileSync('git', ['diff', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', args[1], args[2], '--']);
    if (!readFileSync(args[0]).equals(patch)) throw Error('saved patch differs from committed patch');
    console.log('patches identical');
  } else if (command === 'gate-create') gateCreate();
  else if (command === 'merge') merge(...args);
  else if (command) { const result = check(command); printCheck(result); if (result.errors.length) process.exitCode = 1; }
  else throw Error('Usage: check-review-ledger.mjs <key-dir> | reserve|snapshot|status|note|record|compare|gate-create|merge ...');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`review-ledger: ${error.message}`); process.exitCode = 1; }
}
