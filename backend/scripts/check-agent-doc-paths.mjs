#!/usr/bin/env node
// Agent document pointer validation (#1705).
// Recognized backticked paths are repository-relative; Markdown destinations are document-relative.
// Bare source filenames and app-relative imports (src/, test/, etc.) are not repo pointers.
// Unqualified names are checked in the repo root, app roots, backend/scripts and .github/workflows.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../../', import.meta.url)));
// Use the index so ignored/untracked local files cannot make a broken pointer pass.
const gitOptions = { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
let filenames;
let setupStage = 'root';
try {
  const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], gitOptions).trim();
  if (realpathSync(gitRoot) !== realpathSync(root)) {
    console.error(`not a Git repository root: ${root}`);
    process.exit(2);
  }
  setupStage = 'index';
  filenames = execFileSync('git', ['ls-files', '--cached', '-z'], gitOptions);
} catch (error) {
  const message = error.code === 'ENOENT' && error.path === 'git' && existsSync(root)
    ? 'git not found'
    : setupStage === 'root' ? `not a Git repository root: ${root}` : `cannot read Git index: ${root}`;
  console.error(message.replace(/[\r\n]+/g, ' '));
  process.exit(2);
}
const trackedPaths = new Set();
for (const filename of filenames.split('\0')) {
  if (!filename) continue;
  trackedPaths.add(''); // The repository root is also a tracked directory prefix.
  trackedPaths.add(filename);
  let directory = path.posix.dirname(filename);
  while (directory !== '.') {
    trackedPaths.add(directory);
    directory = path.posix.dirname(directory);
  }
}
const trackedPathExists = target => trackedPaths.has(path.relative(root, target).split(path.sep).join('/')) && existsSync(target);
const allowlistPath = path.join(root, 'backend/scripts/agent-doc-paths.allowlist');
const allowlist = new Set((trackedPathExists(allowlistPath) ? readFileSync(allowlistPath, 'utf8') : '')
  .split('\n').map(line => line.split('#')[0].trim().replace(/\/$/, '')).filter(Boolean));
const appRelativePath = /^(?:@|src\/|test\/|config\/|styles\/|components\/|dist\/|node_modules\/|tsconfig-paths\/)/;
const repoDirectoryPath = /^(?:backend|frontend|docs|nginx|\.github|\.husky)\//;
const fileOrDirectorySuffix = /(?:\.[a-z\d]+|\/)$/i;
const rootFilename = /^(?:[\w.-]+\.(?:md|json|ya?ml|sh|toml|cjs|mjs|txt|xml|ini|conf|lock)|Dockerfile|Makefile|LICENSE|playwright\.config\.ts|\.env[\w.-]*)$/;
const unqualifiedFileDirectories = ['backend', 'frontend', 'backend/scripts', '.github/workflows'];
const visited = new Set();
const errors = [];
const skipped = value => /[*<>]/.test(value);
const external = value => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);
const stripLine = value => value.replace(/:\d+(?:[-:]\d+)?$/, '');
const relative = value => path.relative(root, value).split(path.sep).join('/');

function stripFencesAndComments(text) {
  let previous;
  do {
    previous = text;
    text = text.replace(/<!--[\s\S]*?-->/g, '');
  } while (text !== previous);
  return text.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '');
}

function stripHeadingHtml(text) {
  let previous;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, '');
  } while (text !== previous);
  return text;
}

function anchors(text) {
  const result = new Set();
  const counts = new Map();
  const lines = stripFencesAndComments(text).split('\n');
  for (let index = 0; index < lines.length; index++) {
    const heading = lines[index].match(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/)?.[1]
      ?? (index + 1 < lines.length && /^ {0,3}(?:=+|-+)\s*$/.test(lines[index + 1]) ? lines[index].trim() : undefined);
    if (!heading) continue;
    const slug = stripHeadingHtml(heading.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1'))
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '')
      .replace(/\s/g, '-');
    let id = slug;
    let count = counts.get(slug) ?? 0;
    while (result.has(id)) id = `${slug}-${++count}`;
    counts.set(slug, count);
    result.add(id);
  }
  return result;
}

function pathExistsOrReport(target, source, reference) {
  const name = relative(target);
  if (trackedPathExists(target)) return true;
  if (!allowlist.has(name)) errors.push(`${relative(source)}: missing path ${reference} (${name})`);
  return false;
}

function visit(document) {
  if (visited.has(document)) return;
  visited.add(document);
  if (!pathExistsOrReport(document, document, relative(document))) return;
  const text = stripFencesAndComments(readFileSync(document, 'utf8'));
  for (const [, code] of text.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) {
    const value = stripLine(code);
    if (skipped(value) || external(value) || /[\s(){}]/.test(value) || value.startsWith('/')) continue;
    if (value.startsWith('./')) {
      pathExistsOrReport(path.resolve(root, value), document, code);
      continue;
    }
    // Source/import paths are app-relative, unlike explicit repo paths or ./ paths.
    if (appRelativePath.test(value)) continue;
    const qualified = value.includes('/');
    if (qualified && !repoDirectoryPath.test(value) && !fileOrDirectorySuffix.test(value)) continue;
    const rootFile = rootFilename.test(value);
    if (!qualified && !rootFile) continue;
    let target = path.resolve(root, value);
    // Unqualified configuration/script names may refer to either app or CI tooling.
    if (!qualified && !trackedPathExists(target)) {
      target = unqualifiedFileDirectories.map(directory => path.join(root, directory, value))
        .find(candidate => trackedPathExists(candidate)) ?? target;
    }
    pathExistsOrReport(target, document, code);
  }
  const linkText = text.replace(/(`+)[^\r\n]*?\1/g, '');
  const definitions = new Map([...linkText.matchAll(/^ {0,3}\[([^\]]+)\]:\s*(<[^>]+>|\S+)/gm)]
    .map(([, label, destination]) => [label.toLowerCase(), destination]));
  const destinations = [...linkText.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>]*>|[^\s)]*)(?:\s+['"][^\n]*?['"])?\s*\)/g)].map(match => match[1]);
  for (const [, label, ref] of linkText.matchAll(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
    const destination = definitions.get((ref || label).toLowerCase());
    if (destination) destinations.push(destination);
  }
  // Include shortcut reference links and definitions, which also protects unused local pointers.
  destinations.push(...definitions.values());
  for (let destination of new Set(destinations)) {
    destination = destination.replace(/^<|>$/g, '');
    if (external(destination) || skipped(destination)) continue;
    const hash = destination.indexOf('#');
    let filename = hash < 0 ? destination : destination.slice(0, hash);
    let anchor = hash < 0 ? '' : destination.slice(hash + 1);
    try { filename = decodeURIComponent(filename); anchor = decodeURIComponent(anchor); }
    catch { errors.push(`${relative(document)}: invalid URL encoding ${destination}`); continue; }
    const target = filename ? path.resolve(path.dirname(document), stripLine(filename)) : document;
    if (!pathExistsOrReport(target, document, destination)) continue;
    const markdownFile = /\.md$/i.test(target) && statSync(target).isFile();
    if (anchor && markdownFile && !anchors(readFileSync(target, 'utf8')).has(anchor)) {
      errors.push(`${relative(document)}: missing anchor #${anchor} in ${relative(target)}`);
    }
    if (markdownFile) visit(target);
  }
}

for (const entry of ['CLAUDE.md', 'AGENTS.md']) visit(path.join(root, entry));
if (errors.length) {
  console.error([...new Set(errors)].join('\n'));
  process.exitCode = 1;
} else console.log(`Checked paths and heading anchors in ${visited.size} agent documents.`);
