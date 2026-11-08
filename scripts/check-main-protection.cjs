'use strict';

const { readFileSync, readdirSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual, inspect } = require('node:util');
const YAML = require('yaml');
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

// Intentionally conservative text policy, not a shell parser: workflows have
// no reason to invoke git push. Reject git followed by push anywhere in the
// same run block, even in comments/echo, regardless of destination or options.
// Strip shell quote/escape spelling before matching, but never execute text.
// Dynamically assembled names, external scripts/actions and alternate release
// config files still require review. Semantic-release's internal tag push is
// unaffected; no explicit tag-push exception is currently needed.
function checkWriterText(text, location) {
  const spelling = text.replace(/\\\r?\n/g, '').replace(/['"`\\]/g, '');
  if (/\bgit\b[\s\S]*?\bpush\b/.test(spelling)) {
    throw new Error(`${location}: explicit git push is forbidden; use PR merges and semantic-release for tags`);
  }
  if (/@semantic-release\/git(?:$|[^\w-])/.test(spelling)) {
    throw new Error(`${location}: @semantic-release/git is forbidden because it writes branch commits`);
  }
}

// Only resolve string literals, templates and string concatenations. This is
// not configuration execution: dynamic values remain unresolved.
function stringValue(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') {
    return node.quasis.map((part, index) => (part.value.cooked ?? part.value.raw)
      + (index < node.expressions.length ? stringValue(node.expressions[index]) ?? '$UNRESOLVED' : '')).join('');
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = stringValue(node.left);
    const right = stringValue(node.right);
    if (left !== undefined && right !== undefined) return left + right;
  }
}

function checkReleaseStrings(node) {
  if (!node || typeof node !== 'object') return;
  const value = stringValue(node);
  if (value !== undefined) checkWriterText(value, 'release.config.cjs');
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) child.forEach(checkReleaseStrings);
    else if (child && typeof child === 'object') checkReleaseStrings(child);
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
        if (typeof step.run === 'string') checkWriterText(step.run, `${file}: ${id}/${step.name || 'run'}`);
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
  // JavaScript comments are excluded; escapes and constant strings are decoded.
  checkReleaseStrings(parse(release, { ecmaVersion: 'latest', sourceType: 'script' }));
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

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { checkRepository };
