#!/usr/bin/env node
// #1429: validate links and anchors in tracked Markdown without network access.
// Limits: raw HTML links/anchors, four-space code, undefined shortcut refs,
// and fragments on non-Markdown targets are intentionally not checked.
// Fenced and matched inline code are ignored; unmatched backticks are literal.
// Fences allow up to three leading spaces and inline spans can cross lines.
// Thematic breaks and setext underlines are distinguished by block context.
// Multi-line setext titles drop line breaks when deriving GitHub-style slugs.
// Fragments on directory paths are not checked as Markdown anchors.
// Also fails on a repeated `**Term**:` definition in the root GLOSSARY.md (#1459).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] });
}

function normalizeLabel(label) {
  return label.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function stripInlineTags(value) {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '<') {
      const end = value.indexOf('>', index + 1);
      if (end >= 0) {
        index = end;
        continue;
      }
    }
    output += value[index];
  }
  return output;
}

function headingText(value) {
  return stripInlineTags(value)
    .replace(/!?(\[([^\]]*)\])\([^)]*\)/gu, '$2')
    .replace(/!?\[([^\]]*)\]\[[^\]]*\]/gu, '$1')
    .replace(/(`+)(.*?)\1/gsu, '$2')
    .replace(/(^|[^\p{L}\p{N}])_+([^_]+?)_+(?=$|[^\p{L}\p{N}])/gu, '$1$2')
    .replace(/[\\*~]/gu, '')
    .replace(/&(?:amp|lt|gt|quot|#39);/gu, (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[entity]);
}

function isHeading(line) {
  return Boolean(atxHeading(line));
}

function atxHeading(line) {
  return line.match(/^ {0,3}#{1,6}(?:\s+|$)(.*)$/u);
}

function isSetextUnderline(line) {
  return /^ {0,3}(?:=+|-+)\s*$/u.test(line);
}

function isThematicBreak(line) {
  return /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/u.test(line);
}

function isListItem(line) {
  return /^ {0,3}(?:[*+-](?:\s+|$)|\d{1,9}[.)](?:\s+|$))/u.test(line);
}

function isBlockQuote(line) {
  return /^ {0,3}>/u.test(line);
}

function fenceOpening(line) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
  return match ? { char: match[1][0], length: match[1].length } : null;
}

function closesFence(line, fence) {
  return new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`, 'u').test(line);
}

function advanceFence(line, fence) {
  if (fence) return { inFence: true, fence: closesFence(line, fence) ? null : fence, opened: false };
  const opening = fenceOpening(line);
  return { inFence: Boolean(opening), fence: opening, opened: Boolean(opening) };
}

function createFenceLineSkipper() {
  let fence = null;
  return (line, beforeOpening) => {
    const step = advanceFence(line, fence);
    fence = step.fence;
    if (!step.inFence) return false;
    if (step.opened) beforeOpening();
    return true;
  };
}

function slugHeadings(lines) {
  const headings = new Set();
  let paragraph = [];
  const skipFenceLine = createFenceLineSkipper();
  const clearHeadingParagraph = () => { paragraph = []; };
  const add = (raw) => {
    const text = headingText(raw).toLowerCase();
    let slug = text
      .replace(/[^\p{L}\p{M}\p{N} _-]/gu, '')
      .replace(/\s/gu, '-');
    const base = slug;
    let suffix = 0;
    while (headings.has(slug)) slug = `${base}-${++suffix}`;
    headings.add(slug);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (skipFenceLine(line, clearHeadingParagraph)) continue;
    if (!line.trim()) { clearHeadingParagraph(); continue; }
    const atx = atxHeading(line);
    if (atx) { clearHeadingParagraph(); add(atx[1].replace(/\s+#+\s*$/u, '')); continue; }
    if (isSetextUnderline(line)) {
      if (paragraph.length) add(paragraph.join(''));
      clearHeadingParagraph();
      continue;
    }
    if (isThematicBreak(line) || isListItem(line) || isBlockQuote(line)) { clearHeadingParagraph(); continue; }
    paragraph.push(line.trim());
  }
  return headings;
}

function maskCodeSpans(text) {
  const chars = text.split('');
  const runs = [...text.matchAll(/`+/gu)];
  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i][0];
    const close = runs.find((match, index) => index > i && match[0].length === run.length);
    if (!close) continue;
    const start = runs[i].index;
    const end = close.index + close[0].length;
    for (let p = start; p < end; p += 1) if (chars[p] !== '\n') chars[p] = ' ';
    i = runs.indexOf(close);
  }
  return chars.join('');
}

function matchingBracket(text, start, open, close) {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '\\') { i += 1; continue; }
    if (text[i] === open) depth += 1;
    if (text[i] === close && --depth === 0) return i;
  }
  return -1;
}

function inlineDestination(body) {
  const value = body.trim();
  if (value.startsWith('<')) {
    const end = value.indexOf('>');
    return end < 0 ? value.slice(1) : value.slice(1, end);
  }
  let depth = 0;
  let destination = '';
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === '\\' && i + 1 < value.length) { destination += value[++i]; continue; }
    if (char === '(') depth += 1;
    if (char === ')') {
      if (!depth) break;
      depth -= 1;
    }
    if (/\s/u.test(char) && depth === 0) break;
    destination += char;
  }
  return destination;
}

function scanInline(text, lineAt, document) {
  const masked = maskCodeSpans(text);
  for (let i = 0; i < masked.length; i += 1) {
    let start = i;
    if (masked[i] === '!' && masked[i + 1] === '[') i += 1;
    if (masked[i] !== '[') continue;
    const close = matchingBracket(masked, i, '[', ']');
    if (close < 0) continue;
    const label = text.slice(i + 1, close);
    let destination = null;
    let end = close;
    if (masked[close + 1] === '(') {
      const parenClose = matchingBracket(masked, close + 1, '(', ')');
      if (parenClose < 0) continue;
      destination = inlineDestination(text.slice(close + 2, parenClose));
      end = parenClose;
    } else if (masked[close + 1] === '[') {
      const refClose = matchingBracket(masked, close + 1, '[', ']');
      if (refClose < 0) continue;
      const id = text.slice(close + 2, refClose) || label;
      const normalized = normalizeLabel(id);
      end = refClose;
      if (document.references.has(normalized)) destination = document.references.get(normalized).destination;
      else {
        document.failures.push({ source: document.source, line: lineAt(start), link: text.slice(start, end + 1), reason: 'undefined reference' });
        i = end;
        continue;
      }
    } else {
      const ref = document.references.get(normalizeLabel(label));
      if (!ref) { i = close; continue; }
      destination = ref.destination;
    }
    if (destination !== null) {
      document.links.push({ source: document.source, line: lineAt(start), link: text.slice(start, end + 1), destination });
      i = end;
    }
  }
}

function collectLinks(content, document) {
  const lines = content.split(/\r?\n/u);
  const paragraphs = [];
  let paragraph = [];
  const skipFenceLine = createFenceLineSkipper();
  const finishLinkParagraph = () => {
    if (!paragraph.length) return;
    const joined = paragraph.map((entry) => entry.text).join('\n');
    const starts = [];
    let position = 0;
    for (const entry of paragraph) { starts.push([position, entry.line]); position += entry.text.length + 1; }
    const lineAt = (index) => [...starts].reverse().find(([at]) => at <= index)?.[1] ?? paragraph[0].line;
    paragraphs.push({ joined, lineAt });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (skipFenceLine(line, finishLinkParagraph)) continue;
    if (!line.trim()) { finishLinkParagraph(); continue; }
    const footnote = line.match(/^ {0,3}\[\^[^\]]+\]:\s*(.*)$/u);
    if (footnote) {
      finishLinkParagraph();
      if (footnote[1]) paragraph.push({ text: footnote[1], line: i + 1 });
      finishLinkParagraph();
      continue;
    }
    const definition = line.match(/^ {0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/u);
    if (definition) {
      finishLinkParagraph();
      const destination = definition[2] ?? definition[3];
      document.references.set(normalizeLabel(definition[1]), { destination });
      document.links.push({ source: document.source, line: i + 1, link: line.trim(), destination });
      continue;
    }
    if (isHeading(line)) {
      finishLinkParagraph();
      paragraph.push({ text: line, line: i + 1 });
      finishLinkParagraph();
      continue;
    }
    if (isThematicBreak(line) || isSetextUnderline(line)) { finishLinkParagraph(); continue; }
    paragraph.push({ text: line, line: i + 1 });
  }
  finishLinkParagraph();
  // References are resolved after collecting definitions, so forward uses work.
  for (const item of paragraphs) scanInline(item.joined, item.lineAt, document);
}

function findRepositoryRoot() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  return git(['rev-parse', '--show-toplevel'], scriptDirectory).toString().trim();
}

function trackedMarkdown(root) {
  const tracked = git(['ls-files', '-z'], root).toString('utf8').split('\0').filter(Boolean);
  const markdown = tracked.filter((file) => file.toLowerCase().endsWith('.md'));
  if (!markdown.length) throw new Error('zero Markdown files discovered');
  return { tracked, markdown };
}

function readDocuments(root, markdown) {
  return new Map(markdown.map((source) => {
    const content = readFileSync(path.join(root, source), 'utf8');
    const document = {
      source,
      links: [],
      failures: [],
      references: new Map(),
      anchors: slugHeadings(content.split(/\r?\n/u)),
    };
    collectLinks(content, document);
    return [source, document];
  }));
}

function failLink(document, link, reason) {
  document.failures.push({
    source: document.source,
    line: link.line,
    link: link.link,
    reason,
  });
}

function isExternalTarget(target) {
  return /^[a-z][a-z\d+.-]*:/iu.test(target) || target.startsWith('//');
}

function checkLink(context, document, link) {
  const { root, tracked, trackedSet, documents } = context;
  const target = link.destination;
  const hash = target.indexOf('#');
  let targetPath;
  let fragment;
  try {
    targetPath = decodeURIComponent(hash < 0 ? target : target.slice(0, hash));
    fragment = hash < 0 ? null : decodeURIComponent(target.slice(hash + 1));
  } catch {
    failLink(document, link, 'invalid percent-encoding');
    return;
  }
  if (targetPath.startsWith('/')) {
    failLink(document, link, 'absolute paths are not allowed; use a relative path');
    return;
  }
  const sourceDirectory = path.posix.dirname(document.source);
  const sameFile = document.source.slice(sourceDirectory === '.' ? 0 : sourceDirectory.length + 1);
  const relative = path.posix.normalize(path.posix.join(sourceDirectory, targetPath || sameFile));
  const absolute = path.resolve(root, relative);
  const fromRoot = path.relative(root, absolute);
  if (fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    failLink(document, link, 'escapes repository');
    return;
  }
  const normalized = relative.replace(/^\.\//u, '');
  const existsFile = trackedSet.has(normalized);
  const existsDirectory = normalized === '.'
    ? tracked.length > 0
    : tracked.some((entry) => entry.startsWith(`${normalized.replace(/\/$/u, '')}/`));
  if (!existsFile && !existsDirectory) {
    failLink(document, link, existsSync(absolute)
      ? 'target does not exist in Git (found on disk but untracked or ignored; stage it with git add)'
      : 'target does not exist');
    return;
  }
  if (fragment === null || !normalized.toLowerCase().endsWith('.md')) return;
  const targetDocument = documents.get(normalized);
  if (!targetDocument || targetDocument.anchors.has(fragment)) return;
  const lowercaseMatch = [...targetDocument.anchors].find((slug) => slug.toLowerCase() === fragment.toLowerCase());
  failLink(document, link, lowercaseMatch
    ? `anchor "#${fragment}" not found; use "#${lowercaseMatch}"`
    : `anchor "#${fragment}" not found`);
}

function validateDocuments(root, tracked, documents) {
  const context = { root, tracked, trackedSet: new Set(tracked.map((file) => path.posix.normalize(file))), documents };
  let externalSkipped = 0;
  for (const document of documents.values()) {
    for (const link of document.links) {
      if (isExternalTarget(link.destination)) externalSkipped += 1;
      else checkLink(context, document, link);
    }
  }
  return externalSkipped;
}

function duplicateGlossaryTerms(root, trackedSet) {
  if (!trackedSet.has('GLOSSARY.md')) return [];
  const lines = readFileSync(path.join(root, 'GLOSSARY.md'), 'utf8').split(/\r?\n/u);
  const firstLine = new Map();
  const duplicates = [];
  const skipFenceLine = createFenceLineSkipper();
  for (let i = 0; i < lines.length; i += 1) {
    if (skipFenceLine(lines[i], () => {})) continue;
    const term = lines[i].match(/^\*\*([^*]+)\*\*:\s*$/u);
    if (!term) continue;
    const key = term[1].trim().toLowerCase();
    if (firstLine.has(key)) {
      duplicates.push({ line: i + 1, term: term[1], first: firstLine.get(key) });
    } else firstLine.set(key, i + 1);
  }
  return duplicates;
}

function report(root, documents, externalSkipped, glossaryDuplicates) {
  const failures = [...documents.values()].flatMap((document) => document.failures);
  failures.sort((a, b) => a.source < b.source ? -1 : a.source > b.source ? 1 : a.line - b.line);
  for (const failure of failures) process.stdout.write(`${failure.source}:${failure.line}: ${failure.link} — ${failure.reason}\n`);
  for (const duplicate of glossaryDuplicates) {
    process.stdout.write(`GLOSSARY.md:${duplicate.line}: **${duplicate.term}** — duplicate glossary term; first defined at line ${duplicate.first}\n`);
  }
  const links = [...documents.values()].flatMap((document) => document.links);
  const checked = links.length - externalSkipped;
  const problems = [];
  if (failures.length) problems.push(`${failures.length} broken ${failures.length === 1 ? 'link' : 'links'}`);
  if (glossaryDuplicates.length) {
    problems.push(`${glossaryDuplicates.length} duplicate glossary ${glossaryDuplicates.length === 1 ? 'term' : 'terms'}`);
  }
  const summary = `${checked} local links checked in ${documents.size} files (${externalSkipped} external skipped) in ${root}`;
  process.stdout.write(`${[...problems, summary].join(', ')}\n`);
  if (problems.length) process.exitCode = 1;
}

function main() {
  const root = findRepositoryRoot();
  const { tracked, markdown } = trackedMarkdown(root);
  const documents = readDocuments(root, markdown);
  const externalSkipped = validateDocuments(root, tracked, documents);
  report(root, documents, externalSkipped, duplicateGlossaryTerms(root, new Set(tracked)));
}

try { main(); }
catch (error) {
  process.stderr.write(`verify-doc-links: ${error.message}\n`);
  process.exitCode = 2;
}
