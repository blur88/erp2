#!/usr/bin/env node
import { Parser } from 'commonmark';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync, lstatSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const hash = text => createHash('sha256').update(text).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).replace(/\n$/, '');
const inside = (root, path) => { const rel = relative(root, path); return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };

function markdownPointers(content) {
  const walker = new Parser().parse(content).walker();
  const destinations = [];
  let event;
  while ((event = walker.next())) {
    if (event.entering && ['link', 'image'].includes(event.node.type)) destinations.push(event.node.destination);
  }
  return destinations.map(value => decodeURIComponent(value.split('#')[0])).filter(target => target && !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target) && /\.md$/i.test(target));
}
function present(path) {
  try { lstatSync(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function workingTree(selectedPaths = []) {
  const root = git('rev-parse', '--show-toplevel');
  const directory = mkdtempSync(resolve(tmpdir(), 'preflight-index-'));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: resolve(directory, 'index'), GIT_LITERAL_PATHSPECS: '1' };
    const run = (...args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    run('read-tree', 'HEAD'); run('add', '-u');
    if (selectedPaths.length) run('add', '--', ...selectedPaths);
    return run('write-tree');
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
// Read conventions before resolving the requested baseline. Both harnesses use this boundary.
export function loadPreflight(request) {
  const root = realpathSync(git('rev-parse', '--show-toplevel'));
  if (!['codex', 'claude-code'].includes(request.harness) || typeof request.agent !== 'string' || !request.agent.trim()) throw Error('preflight requires harness and agent identity');
  if (!['committed', 'working-tree', 'pre-merge', 'scope-reset'].includes(request.kind) || !['full PR', 'delta'].includes(request.scope)) throw Error('invalid preflight kind/scope');
  if (request.conflicts?.length) throw Error('unresolved convention conflicts');
  const conventions = [], seen = new Set();
  function load(path) {
    const absolute = resolve(root, path);
    const canonical = realpathSync(absolute);
    if (!inside(root, canonical) || canonical !== absolute) throw Error(`unverifiable convention path: ${path}`);
    if (seen.has(canonical)) return;
    seen.add(canonical);
    if (!statSync(canonical).isFile()) throw Error(`convention is not a file: ${path}`);
    const bytes = readFileSync(canonical), content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (!content.trim() || /^(?:<<<<<<<|=======|>>>>>>>)(?: |$)/m.test(content)) throw Error(`empty, unreadable or conflicting conventions: ${path}`);
    conventions.push({ path: canonical, sha256: hash(bytes), content });
    // Local Markdown pointers are required once reached. External links are references, not executable guidance.
    for (const target of markdownPointers(content)) load(resolve(dirname(canonical), target));
  }
  for (const path of ['AGENTS.md', 'CLAUDE.md', 'CODING_STANDARDS.md']) load(path);
  const review = 'docs/agents/code-review.md';
  if (present(resolve(root, review))) load(review);
  const head = git('rev-parse', 'HEAD');
  const baseline = git('rev-parse', '--verify', '--end-of-options', `${request.baseline}^{commit}`);
  const target = request.kind === 'working-tree' ? request.tree : head;
  if (!/^[a-f\d]{40}$/.test(target ?? '')) throw Error('working-tree preflight requires a captured tree');
  git('cat-file', '-e', `${target}^{tree}`);
  const paths = git('diff', '--name-only', '-z', baseline, target, '--').split('\0').filter(Boolean);
  for (const path of paths) {
    let directory = dirname(path);
    while (directory !== '.') {
      for (const name of ['AGENTS.md', 'CLAUDE.md']) {
        const candidate = resolve(root, directory, name);
        if (present(candidate)) load(candidate);
      }
      directory = dirname(directory);
    }
  }
  return { version: 1, status: 'passed', root, harness: request.harness, agent: request.agent, kind: request.kind, scope: request.scope, baseline, head, target, selectedPaths: request.selectedPaths ?? [], paths, precedence: 'Repository conventions override generic skills; scoped guidance supplements root guidance; unresolved conflicts fail closed.', conventions };
}
export function validatePreflight(data, expected, live = true) {
  if (!data || data.version !== 1 || data.status !== 'passed') throw Error('missing valid preflight evidence');
  for (const [name, value] of Object.entries(expected)) if (data[name] !== value) throw Error(`preflight ${name} differs from round`);
  if (!Array.isArray(data.conventions) || !data.conventions.length || data.conventions.some(c => hash(c.content) !== c.sha256 || !isAbsolute(c.path))) throw Error('unverifiable preflight content hashes');
  if (data.kind !== 'working-tree' && data.target !== data.head) throw Error('preflight target differs from committed head');
  const actualPaths = git('diff', '--name-only', '-z', data.baseline, data.target, '--').split('\0').filter(Boolean);
  if (JSON.stringify(actualPaths) !== JSON.stringify(data.paths)) throw Error('preflight path scope differs from target');
  const saved = new Map(data.conventions.map(c => [c.path, c]));
  if (saved.size !== data.conventions.length) throw Error('duplicate preflight conventions');
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'CODING_STANDARDS.md']) if (!saved.has(resolve(data.root, file))) throw Error('missing required convention evidence');
  for (const convention of data.conventions) {
    if (!inside(data.root, convention.path)) throw Error('convention evidence escapes repository');
    for (const target of markdownPointers(convention.content)) if (!saved.has(resolve(dirname(convention.path), target))) throw Error('missing convention pointer evidence');
  }
  if (!live) {
    git('cat-file', '-e', `${data.target}^{tree}`);
    return data;
  }
  if (data.kind === 'working-tree' && workingTree(data.selectedPaths) !== data.target) throw Error('stale preflight working-tree snapshot');
  const current = loadPreflight({ ...data, tree: data.kind === 'working-tree' ? data.target : undefined });
  if (JSON.stringify(current) !== JSON.stringify(data)) throw Error('stale or unverifiable preflight conventions/scope/state');
  return data;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'validate') { validatePreflight(JSON.parse(readFileSync(process.argv[3], 'utf8')), {}); console.log('valid preflight'); }
    else {
    if (process.argv[2] !== 'load') throw Error('Usage: review-preflight.mjs load <request.json>');
    console.log(JSON.stringify(loadPreflight(JSON.parse(readFileSync(process.argv[3], 'utf8')))));
    }
  } catch (error) { console.error(`review-preflight: ${error.message}`); process.exitCode = 1; }
}
