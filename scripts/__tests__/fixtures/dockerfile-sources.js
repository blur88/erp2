// Static check behind dockerfile-sources.test.js (#2018): every explicit local
// COPY/ADD source in a Dockerfile must be tracked in Git and must survive the
// build context's .dockerignore, otherwise a clean checkout cannot build the
// image even though the build passes on a working tree that still holds the file.
//
// Origin: during #1975 nginx/dhparam-ffdhe2048.pem was COPYed by nginx/Dockerfile
// and present on disk, but .gitignore's `*.pem` kept it out of the commit. The
// local build passed; a clean CI checkout would have failed.
//
// COVERAGE LIMITS. This is a static check of what the Dockerfile *says*, not of
// what the build *reads*.
//   - Broad copies (`COPY . .`, or any directory source) are not verified file by
//     file. They only prove the source holds at least one tracked, non-ignored
//     file, and they are reported in `broad` so the test can pin the known set.
//     An ignored-but-present file under a broad copy (the #1975 failure class)
//     is NOT detected there.
//   - `RUN --mount=type=bind` (without `from=`), `ADD <git url>`, `ONBUILD COPY`,
//     and anything a RUN step reads from the context at build time are not
//     modelled.
//   - Sources containing `$VAR`/`${VAR}` cannot be resolved statically and are
//     reported as problems rather than skipped (fail closed).
//   - Wildcards use Go filepath.Match rules plus `**`, the same dialect as
//     .dockerignore. A wildcard must match at least one tracked file. This is
//     deliberately stricter than needed: whether or not Docker tolerates a
//     wildcard that matches nothing, a COPY that silently copies nothing is the
//     failure this check exists to catch.
//   - The build context is the Dockerfile's directory unless the caller says
//     otherwise; dockerfile-sources.test.js verifies that against Compose and
//     the release workflow.
//   - "Tracked" means present in the Git index (`git ls-files`), so a file that is
//     staged but not yet committed passes locally and in CI alike once committed.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const posix = path.posix;

// --- Dockerfile parsing ------------------------------------------------------

const HEREDOC = /<<-?(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/g;
const HEREDOC_INSTRUCTIONS = new Set(['RUN', 'COPY', 'ADD']);

// Logical instructions: comments and blank lines removed (also inside a
// continuation, as Docker does), continuations joined, heredoc bodies consumed.
function parseInstructions(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let escape = '\\';
  // Parser directives are only valid in the leading comment block.
  for (const line of lines) {
    const m = /^\s*#\s*([a-zA-Z]+)\s*=\s*(\S+)\s*$/.exec(line);
    if (!m) break;
    if (m[1].toLowerCase() === 'escape') escape = m[2];
  }

  const instructions = [];
  let i = 0;
  while (i < lines.length) {
    const startLine = i + 1;
    let logical = '';
    let started = false;
    while (i < lines.length) {
      const raw = lines[i++];
      const trimmed = raw.trim();
      if (trimmed === '' || trimmed.startsWith('#')) {
        // Skipped, including inside a continuation.
        if (!started) break;
        continue;
      }
      started = true;
      const stripped = raw.replace(/\s+$/, '');
      if (stripped.endsWith(escape)) {
        logical += stripped.slice(0, -escape.length);
        continue;
      }
      logical += stripped;
      break;
    }
    if (!started) continue;

    const text0 = logical.trim();
    const keyword = (/^\S+/.exec(text0) || [''])[0].toUpperCase();
    const rest = text0.slice(keyword.length).trim();
    const heredocs = [];
    if (HEREDOC_INSTRUCTIONS.has(keyword)) {
      for (const m of rest.matchAll(HEREDOC)) heredocs.push({ name: m[2], dash: m[0].startsWith('<<-') });
      for (const doc of heredocs) {
        while (i < lines.length) {
          const body = lines[i++];
          if ((doc.dash ? body.replace(/^\t+/, '') : body) === doc.name) break;
        }
      }
    }
    instructions.push({ keyword, line: startLine, rest });
  }
  return instructions;
}

// Whitespace split that keeps quoted words together and removes the quotes.
function splitWords(text) {
  const words = [];
  let current = '';
  let quote = null;
  let inWord = false;
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inWord = true;
    } else if (/\s/.test(ch)) {
      if (inWord) words.push(current);
      current = '';
      inWord = false;
    } else {
      current += ch;
      inWord = true;
    }
  }
  if (inWord) words.push(current);
  return words;
}

// COPY/ADD operands: leading `--flag[=value]` options, then a JSON array or
// whitespace-delimited words. The last word is the destination.
function parseCopyOperands(rest) {
  const flags = {};
  let body = rest;
  for (;;) {
    const m = /^--([A-Za-z-]+)(?:=("[^"]*"|'[^']*'|\S*))?\s*/.exec(body);
    if (!m) break;
    flags[m[1].toLowerCase()] = m[2] === undefined ? true : m[2].replace(/^(["'])(.*)\1$/, '$2');
    body = body.slice(m[0].length);
  }
  let words;
  if (body.startsWith('[')) {
    try {
      words = JSON.parse(body);
    } catch (error) {
      return { flags, error: `JSON array form is not valid JSON (${error.message})` };
    }
    if (!Array.isArray(words) || !words.every(w => typeof w === 'string')) {
      return { flags, error: 'JSON array form must contain only strings' };
    }
  } else {
    words = splitWords(body);
  }
  return { flags, words };
}

// --- Glob / .dockerignore matching ------------------------------------------

// Port of moby's pkg/fileutils pattern compiler (PatternMatcher), written from
// reading its source; no Docker version is pinned and it is not run against a
// Docker daemon. Rules: `*` and `?` stop at `/`, `**`
// crosses it, `**/` may match nothing.
function patternToRegExp(pattern) {
  let re = '^';
  for (let k = 0; k < pattern.length; k++) {
    const ch = pattern[k];
    if (ch === '*') {
      if (pattern[k + 1] === '*') {
        k++;
        if (pattern[k + 1] === '/') k++;
        re += k + 1 >= pattern.length ? '.*' : '(.*/)?';
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else if (ch === '\\') {
      if (k + 1 < pattern.length) re += pattern[++k].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (ch === '[') {
      const end = pattern.indexOf(']', k + 1);
      if (end === -1) {
        re += '\\[';
      } else {
        // Passed through as a Go regexp class, as moby does: `[^a]` negates,
        // `[!a]` is a literal `!` or `a`.
        re += `[${pattern.slice(k + 1, end).replace(/\\/g, '\\\\')}]`;
        k = end;
      }
    } else if ('.$()+{}|^]'.includes(ch)) {
      re += `\\${ch}`;
    } else {
      re += ch;
    }
  }
  return new RegExp(`${re}$`);
}

const hasWildcard = source => /[*?[]/.test(source);

function cleanPattern(pattern) {
  const cleaned = posix.normalize(pattern).replace(/^\/+/, '').replace(/\/+$/, '');
  return cleaned === '.' ? '' : cleaned;
}

// Mirrors moby's pkg/fileutils PatternMatcher.MatchesOrParentMatches (same
// caveat as patternToRegExp: ported from reading it, not verified against Docker). Returns the pattern that
// excluded the file, or null when it is kept. Patterns are anchored at the
// context root: `*.pem` is top-level only, `**/*.pem` is any depth.
function parseDockerignore(text) {
  const patterns = [];
  text.replace(/\r\n?/g, '\n').split('\n').forEach((raw, index) => {
    let line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const exclusion = line.startsWith('!');
    if (exclusion) line = line.slice(1).trim();
    const cleaned = cleanPattern(line);
    if (cleaned === '') return;
    patterns.push({ text: raw.trim(), line: index + 1, exclusion, regexp: patternToRegExp(cleaned) });
  });
  return patterns;
}

function dockerignoreMatch(patterns, file) {
  const parents = [];
  const segments = file.split('/');
  for (let k = 1; k < segments.length; k++) parents.push(segments.slice(0, k).join('/'));
  let excludedBy = null;
  for (const pattern of patterns) {
    if (pattern.exclusion !== Boolean(excludedBy)) continue;
    const hit = pattern.regexp.test(file) || parents.some(parent => pattern.regexp.test(parent));
    if (hit) excludedBy = pattern.exclusion ? null : pattern;
  }
  return excludedBy;
}

// --- Git ---------------------------------------------------------------------

// Hooks export GIT_DIR/GIT_INDEX_FILE; a fixture repo must not inherit them.
const cleanGitEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

function git(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', env: cleanGitEnv(), maxBuffer: 256 * 1024 * 1024 });
  if (result.error) throw result.error;
  return result;
}

function gitList(repoRoot, args, contextRel) {
  const result = git(repoRoot, [...args, '-z', '--', contextRel]);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  const prefix = contextRel === '.' ? '' : `${contextRel}/`;
  return result.stdout.split('\0').filter(Boolean).map(file => (prefix ? file.slice(prefix.length) : file));
}

function ignoredBy(repoRoot, repoRelativePath) {
  // --no-index: a clean checkout has no such file, and the rule still applies.
  const result = git(repoRoot, ['check-ignore', '-v', '--no-index', '--', repoRelativePath]);
  const m = result.status === 0 ? /^(.*?):(\d+):(.*?)\t/.exec(result.stdout) : null;
  return m ? `${m[1]}:${m[2]} \`${m[3]}\`` : null;
}

// --- The check ---------------------------------------------------------------

const REMOTE = /^(?:https?|git|ssh):\/\/|^git@/;

// Inline heredocs and remote ADD sources are not build-context files. (`--from`
// copies are skipped earlier, by flag.)
const isContextSource = (keyword, source) => !source.startsWith('<<') && !(keyword === 'ADD' && REMOTE.test(source));

function checkDockerfile({ repoRoot, dockerfile, context = posix.dirname(dockerfile) }) {
  const result = { dockerfile, context, checked: [], broad: [], problems: [] };
  const fail = (instruction, source, reason) => result.problems.push({ dockerfile, line: instruction.line, source, reason });

  const dockerfilePath = path.join(repoRoot, dockerfile);
  const instructions = parseInstructions(fs.readFileSync(dockerfilePath, 'utf8'));

  const tracked = gitList(repoRoot, ['ls-files'], context);
  const trackedSet = new Set(tracked);
  const trackedDirs = new Set();
  for (const file of tracked) {
    const segments = file.split('/');
    for (let k = 1; k < segments.length; k++) trackedDirs.add(segments.slice(0, k).join('/'));
  }
  const untracked = gitList(repoRoot, ['ls-files', '--others'], context);
  const untrackedVisible = new Set(gitList(repoRoot, ['ls-files', '--others', '--exclude-standard'], context));

  const ignoreFile = [`${dockerfilePath}.dockerignore`, path.join(repoRoot, context, '.dockerignore')].find(fs.existsSync);
  const ignoreLabel = ignoreFile ? posix.join(...path.relative(repoRoot, ignoreFile).split(path.sep)) : null;
  const patterns = ignoreFile ? parseDockerignore(fs.readFileSync(ignoreFile, 'utf8')) : [];
  const excluded = file => dockerignoreMatch(patterns, file);
  const keptUnder = dir => tracked.find(file => file.startsWith(`${dir}/`) && !excluded(file));
  const explainExcluded = pattern => `excluded from the build context by ${ignoreLabel}:${pattern.line} \`${pattern.text}\``;
  const repoPath = file => (context === '.' ? file : posix.join(context, file));

  // Why a source has no tracked match, in terms of what a clean checkout lacks.
  const explainUntracked = (matches, target) => {
    const ignored = matches.filter(file => !untrackedVisible.has(file));
    if (ignored.length) {
      const rule = ignoredBy(repoRoot, repoPath(ignored[0]));
      return `${ignored.map(repoPath).join(', ')} exist${ignored.length === 1 ? 's' : ''} in the working tree but ${ignored.length === 1 ? 'is' : 'are'} ignored by ${rule || '.gitignore'}, so a clean checkout will not contain ${ignored.length === 1 ? 'it' : 'them'}`;
    }
    if (matches.length) return `${matches.map(repoPath).join(', ')} exist${matches.length === 1 ? 's' : ''} in the working tree but ${matches.length === 1 ? 'was' : 'were'} never added to Git, so a clean checkout will not contain ${matches.length === 1 ? 'it' : 'them'}`;
    const rule = target && !hasWildcard(target) ? ignoredBy(repoRoot, repoPath(target)) : null;
    return rule
      ? `it does not exist in the build context (a clean checkout never has it: ${repoPath(target)} would be ignored by ${rule})`
      : 'it does not exist in the build context';
  };

  for (const instruction of instructions) {
    if (instruction.keyword !== 'COPY' && instruction.keyword !== 'ADD') continue;
    const { flags, words, error } = parseCopyOperands(instruction.rest);
    if (error) {
      fail(instruction, instruction.rest, error);
      continue;
    }
    if (flags.from) continue; // stage or image copy, not a build-context input
    if (words.length < 2) {
      fail(instruction, instruction.rest, `has ${words.length} operand(s); COPY/ADD needs at least one source and a destination`);
      continue;
    }

    for (const raw of words.slice(0, -1)) {
      if (!isContextSource(instruction.keyword, raw)) continue;
      const source = raw;
      if (/\$/.test(source)) {
        fail(instruction, raw, 'contains a variable, so it cannot be resolved statically; use a literal path so the check can verify it is tracked');
        continue;
      }
      const normalized = posix.normalize(source.replace(/^\/+/, '') || '.');
      if (normalized === '..' || normalized.startsWith('../')) {
        fail(instruction, raw, 'points outside the build context');
        continue;
      }
      const target = normalized.replace(/\/$/, '');

      if (hasWildcard(target)) {
        const regexp = patternToRegExp(target);
        const files = tracked.filter(file => regexp.test(file));
        const dirs = [...trackedDirs].filter(dir => regexp.test(dir));
        const kept = files.filter(file => !excluded(file));
        const keptDirs = dirs.filter(keptUnder);
        if (!kept.length && !keptDirs.length) {
          if (files.length || dirs.length) {
            const by = excluded(files[0] || tracked.find(file => file.startsWith(`${dirs[0]}/`)));
            fail(instruction, raw, `matches only tracked files that are ${by ? explainExcluded(by) : 'excluded by the .dockerignore'}`);
          } else {
            const others = untracked.filter(file => regexp.test(file));
            fail(instruction, raw, `matches no tracked file: ${explainUntracked(others, target)}`);
          }
          continue;
        }
        result.checked.push({ dockerfile, line: instruction.line, source: raw, files: kept });
        for (const dir of keptDirs) result.broad.push({ dockerfile, line: instruction.line, source: raw, directory: dir });
        continue;
      }

      if (target === '.' || target === '') {
        const kept = tracked.filter(file => !excluded(file));
        if (!kept.length) fail(instruction, raw, 'copies the whole build context, but it holds no tracked file that the .dockerignore keeps');
        else result.broad.push({ dockerfile, line: instruction.line, source: raw, directory: '.' });
        continue;
      }

      if (trackedSet.has(target)) {
        const by = excluded(target);
        if (by) fail(instruction, raw, `is ${explainExcluded(by)}`);
        else result.checked.push({ dockerfile, line: instruction.line, source: raw, files: [target] });
        continue;
      }

      if (trackedDirs.has(target)) {
        if (!keptUnder(target)) fail(instruction, raw, 'is a directory whose tracked files are all excluded by the .dockerignore');
        else result.broad.push({ dockerfile, line: instruction.line, source: raw, directory: target });
        continue;
      }

      const others = untracked.filter(file => file === target || file.startsWith(`${target}/`));
      fail(instruction, raw, `is not tracked in Git: ${explainUntracked(others, target)}`);
    }
  }
  return result;
}

const formatProblem = ({ dockerfile, line, source, reason }) =>
  `${dockerfile}:${line}: local COPY/ADD source "${source}" ${reason}`;

module.exports = {
  parseInstructions, parseCopyOperands, parseDockerignore, dockerignoreMatch,
  checkDockerfile, formatProblem, cleanGitEnv,
};
