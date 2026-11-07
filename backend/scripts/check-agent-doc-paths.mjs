#!/usr/bin/env node
// Backticked paths are repository-relative; Markdown destinations are document-relative.
// Bare source filenames and app-relative imports (src/, test/, etc.) are not repo pointers.
// Unqualified configuration files are checked in the repo root and both app roots.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../../', import.meta.url)));
const allowlist = new Set(readFileSync(new URL('./agent-doc-paths.allowlist', import.meta.url), 'utf8')
  .split('\n').map(line => line.split('#')[0].trim().replace(/\/$/, '')).filter(Boolean));
const visited = new Set();
const errors = [];
const skipped = value => /[*<>]/.test(value);
const external = value => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);
const stripLine = value => value.replace(/:\d+(?:[-:]\d+)?$/, '');
const relative = value => path.relative(root, value).split(path.sep).join('/');

function prose(text) {
  return text.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '');
}

function anchors(text) {
  const result = new Set();
  const counts = new Map();
  const lines = prose(text).split('\n');
  for (let index = 0; index < lines.length; index++) {
    const heading = lines[index].match(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/)?.[1]
      ?? (index + 1 < lines.length && /^ {0,3}(?:=+|-+)\s*$/.test(lines[index + 1]) ? lines[index].trim() : undefined);
    if (!heading) continue;
    const slug = heading.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    let id = slug;
    let count = counts.get(slug) ?? 0;
    while (result.has(id)) id = `${slug}-${++count}`;
    counts.set(slug, count);
    result.add(id);
  }
  return result;
}

function check(target, source, reference) {
  const name = relative(target).replace(/\/$/, '');
  if (existsSync(target)) return true;
  if (!allowlist.has(name)) errors.push(`${relative(source)}: missing path ${reference} (${name})`);
  return false;
}

function visit(document) {
  if (visited.has(document)) return;
  visited.add(document);
  if (!check(document, document, relative(document))) return;
  const text = prose(readFileSync(document, 'utf8'));
  for (const [, code] of text.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) {
    const value = stripLine(code);
    if (skipped(value) || external(value) || /[\s(){}]/.test(value) || value.startsWith('/')) continue;
    if (value.startsWith('./')) {
      check(path.resolve(root, value), document, code);
      continue;
    }
    const normalized = value;
    // Source/import paths are app-relative, unlike explicit repo paths or ./ paths.
    if (/^(?:@|src\/|test\/|config\/|scripts\/|styles\/|components\/|dist\/|node_modules\/|tsconfig-paths\/)/.test(normalized)) continue;
    const qualified = normalized.includes('/');
    if (qualified && !/^(?:backend|frontend|docs|nginx|\.github|\.husky)\//.test(normalized)
      && (!/(?:\.[a-z\d]+|\/)$/i.test(normalized) || /^[A-Z]/.test(normalized))) continue;
    const rootFile = /^(?:[\w.-]+\.(?:md|json|ya?ml|sh)|playwright\.config\.ts|\.env[\w.-]*)$/.test(normalized);
    if (!qualified && !rootFile) continue;
    let target = path.resolve(root, value);
    // Unqualified configuration/script names may refer to either app or CI tooling.
    if (!qualified && !existsSync(target)) {
      target = ['backend', 'frontend', 'backend/scripts', '.github/workflows'].map(directory => path.join(root, directory, normalized))
        .find(candidate => existsSync(candidate)) ?? target;
    }
    check(target, document, code);
  }
  const definitions = new Map([...text.matchAll(/^ {0,3}\[([^\]]+)\]:\s*(<[^>]+>|\S+)/gm)]
    .map(([, label, destination]) => [label.toLowerCase(), destination]));
  const destinations = [...text.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>]*>|[^\s)]*)(?:\s+['"][^\n]*?['"])?\s*\)/g)].map(match => match[1]);
  for (const [, label, ref] of text.matchAll(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
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
    if (!check(target, document, destination)) continue;
    if (anchor && statSync(target).isFile() && /\.md$/i.test(target)
      && !anchors(readFileSync(target, 'utf8')).has(anchor)) {
      errors.push(`${relative(document)}: missing anchor #${anchor} in ${relative(target)}`);
    }
    if (/\.md$/i.test(target) && statSync(target).isFile()) visit(target);
  }
}

for (const entry of ['CLAUDE.md', 'AGENTS.md']) visit(path.join(root, entry));
if (errors.length) {
  console.error([...new Set(errors)].join('\n'));
  process.exitCode = 1;
} else console.log(`Checked paths and heading anchors in ${visited.size} agent documents.`);
