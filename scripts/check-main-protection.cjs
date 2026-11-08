'use strict';

const { readFileSync, readdirSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual, inspect } = require('node:util');
const YAML = require('yaml');
const shellQuote = require('shell-quote');
const { parse } = require('acorn');

// GitHub's export/import fields. Server ids, timestamps, links and source metadata
// are deliberately excluded; every editable field remains part of the comparison.
const policyFields = ['name', 'target', 'enforcement', 'conditions', 'rules', 'bypass_actors'];
function policy(value) {
  return Object.fromEntries(policyFields.map(key => {
    if (!(key in value)) throw new Error(`Ruleset is missing ${key}`);
    return [key, value[key]];
  }));
}

// shell-quote treats newlines as spaces and comments as extending to EOF.
// Feed it one logical line at a time, retaining newlines inside quoted words.
function* shellLines(text) {
  let line = '';
  let quote;
  let ansiQuote = false;
  let comment = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (comment) {
      if (char !== '\n') continue;
      comment = false;
    } else if (char === '\\' && (quote !== "'" || ansiQuote)) {
      // Continuations do not end commands. Other escapes must reach shell-quote
      // unchanged so escaped quotes and comment markers keep their meaning.
      if (text[i + 1] === '\n') i++;
      else if (text[i + 1] === '\r' && text[i + 2] === '\n') i += 2;
      else { line += char + (text[++i] ?? ''); }
      continue;
    } else if (quote) {
      if (char === quote) quote = undefined;
    } else if (char === "'" || char === '"') {
      quote = char;
      ansiQuote = char === "'" && text[i - 1] === '$';
    } else if (char === '#') {
      comment = true;
      continue;
    }
    if (char === '\n' && !quote) {
      yield line;
      line = '';
    } else line += char;
  }
  yield line;
}

function checkPushes(text, location) {
  // Unknown variables remain visible so unresolved destinations are rejected.
  const source = text.replace(/\$\{\{[\s\S]*?\}\}/g, '$UNRESOLVED');
  const tokens = [];
  for (const line of shellLines(source)) {
    tokens.push(...shellQuote.parse(line, key => `$${key}`), { op: ';' });
  }
  for (let i = 0; i < tokens.length; i++) {
    if (typeof tokens[i] !== 'string' || !/^(?:.*\/)?git$/.test(tokens[i])) continue;
    const command = [];
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j]?.op === 'glob') command.push(tokens[j].pattern);
      else if (typeof tokens[j] === 'string') command.push(tokens[j]);
      else break;
    }
    // Git global options may precede the subcommand (e.g. git -C repo push).
    const push = command.indexOf('push');
    if (push < 0) continue;
    const args = command.slice(push + 1);
    const positional = [];
    let tags = false;
    for (let j = 0; j < args.length; j++) {
      const arg = args[j];
      if (arg.startsWith('--repo=')) { positional.unshift(arg.slice('--repo='.length)); continue; }
      if (arg === '--tags') { tags = true; continue; }
      if (['--repo', '--receive-pack', '--exec', '-o', '--push-option'].includes(arg)) {
        // --repo supplies the remote instead of a positional argument.
        if (arg === '--repo') positional.unshift(args[j + 1]);
        j++;
        continue;
      }
      if (['--all', '--mirror', '--branches'].includes(arg)) throw new Error(`${location}: branch-wide git push is forbidden`);
      if (arg.startsWith('-') && !arg.startsWith('+')) continue;
      positional.push(arg);
    }
    const refs = positional.slice(1);
    if (refs.length === 0 && !tags) throw new Error(`${location}: implicit git push destination cannot be checked; use explicit refspecs`);
    for (const ref of refs) {
      const destination = ref.slice(ref.lastIndexOf(':') + 1).replace(/^\+/, '');
      if (!destination || /[$`*?]/.test(destination) || /^(?:refs\/heads\/|heads\/)?main$/.test(destination) || ['HEAD', '@'].includes(destination)) {
        throw new Error(`${location}: git push may write main (${ref}); use PR merges`);
      }
    }
  }
}

function checkReleaseCommands(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    checkPushes(node.value, 'release.config.cjs');
  } else if (node.type === 'TemplateLiteral') {
    // Keep interpolation unresolved, as with variables in workflow commands.
    const command = node.quasis.map(part => part.value.cooked ?? part.value.raw).join('$UNRESOLVED');
    checkPushes(command, 'release.config.cjs');
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(checkReleaseCommands);
    else if (value && typeof value === 'object') checkReleaseCommands(value);
  }
}

function checkRepository(root) {
  const snapshot = policy(JSON.parse(readFileSync(join(root, '.github/rulesets/main-protection.json'), 'utf8')));
  const workflows = join(root, '.github/workflows');
  let ci;
  for (const file of readdirSync(workflows).filter(file => /\.ya?ml$/.test(file))) {
    const workflow = YAML.parse(readFileSync(join(workflows, file), 'utf8'));
    if (file === 'ci.yml') ci = workflow;
    for (const [id, job] of Object.entries(workflow.jobs || {})) {
      for (const step of job.steps || []) {
        if (typeof step.run === 'string') checkPushes(step.run, `${file}: ${id}/${step.name || 'run'}`);
      }
    }
  }
  if (!ci?.jobs) throw new Error('ci.yml must define jobs');
  const names = new Set(Object.values(ci.jobs).map(job => job.name));
  const checks = snapshot.rules.filter(rule => rule.type === 'required_status_checks');
  if (checks.length === 0) throw new Error('Ruleset has no required checks');
  for (const rule of checks) {
    for (const { context } of rule.parameters.required_status_checks) {
      if (!names.has(context)) throw new Error(`No CI job name matches required check: ${context}`);
    }
  }
  const release = readFileSync(join(root, 'release.config.cjs'), 'utf8');
  if (/@semantic-release\/git(?:['"\s/]|$)/.test(release)) throw new Error('release.config.cjs: @semantic-release/git writes a branch commit; use tag-only releases');
  // Parse without executing the config. Decoded literals preserve shell quoting,
  // escapes and continuations; JavaScript comments are excluded by the parser.
  checkReleaseCommands(parse(release, { ecmaVersion: 'latest', sourceType: 'script' }));
  return snapshot;
}

function main() {
  const args = process.argv.slice(2);
  let root = resolve(__dirname, '..');
  let compare;
  let drift = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--root' || arg === '--compare') {
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a path`);
      if (arg === '--root') root = resolve(value);
      else compare = value;
    } else if (arg === '--drift') drift = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (compare && drift) throw new Error('Use either --compare or --drift');
  const snapshot = checkRepository(root);
  if (compare || drift) {
    const live = policy(JSON.parse(compare ? readFileSync(compare, 'utf8') : execFileSync('gh', ['api', 'repos/blur88/erp2/rulesets/15609777'], { encoding: 'utf8' })));
    if (!isDeepStrictEqual(snapshot, live)) {
      throw new Error(`Ruleset drift detected\nSnapshot: ${inspect(snapshot, { depth: null })}\nLive: ${inspect(live, { depth: null })}`);
    }
    console.log('No ruleset drift');
  }
  console.log('Main protection checks passed');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
