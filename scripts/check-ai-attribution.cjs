'use strict';

// Check PR commit messages and the current PR body for AI attribution (#2083).
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');

const claudeFamilies = 'Fable|Haiku|Opus|Sonnet';
const modelVersion = '\\d+(?:\\.\\d+)*';
const claudeModel = new RegExp(
  `^Claude (?:Code|(?:${claudeFamilies})(?: ${modelVersion})?|${modelVersion} (?:${claudeFamilies}))(?: \\(1M context\\))?$`,
  'i',
);
const vendorAddress = /^noreply@(?:anthropic\.com|google\.com)$/i;

function isAiCoAuthor(line) {
  const trailer = /^\s*(?:[-*+]\s+)?co-authored-by:\s*([^<>]*?)(?:\s*<([^<>]+)>)?\s*$/i.exec(line);
  if (!trailer) return false;

  const [, name, address] = trailer;
  return vendorAddress.test(address ?? '') ||
    claudeModel.test(name) ||
    /^(?:Gemini|internal-model)$/i.test(name) ||
    (!address && /^Claude$/i.test(name));
}

const rules = [
  { label: 'AI co-author trailer', matches: isAiCoAuthor },
  {
    label: 'Claude session link',
    matches: (line) => /(?:^|[^\w.-])(?:www\.)?claude\.ai\/code\/[^\s)>]+/i.test(line),
  },
  {
    label: 'Claude session trailer',
    matches: (line) => /^\s*claude-session:/i.test(line),
  },
  {
    label: 'Claude Code attribution',
    matches: (line) => /^\s*(?:🤖\s*)?generated with \[Claude Code\]\(https:\/\/(?:claude\.ai\/code|claude\.com\/claude-code)\/?\)\s*$/i.test(line),
  },
];

function reportAttribution(source, message) {
  let violations = 0;
  for (const [index, line] of message.split(/\r?\n/).entries()) {
    for (const { label, matches } of rules) {
      if (matches(line)) {
        console.error(`${source}:${index + 1}: ${label}`);
        violations += 1;
      }
    }
  }
  return violations;
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function main(eventPath, bodyPath) {
  const { pull_request: pr } = JSON.parse(readFileSync(eventPath, 'utf8'));
  if (!pr) {
    console.log('::notice::Skipping AI attribution check because there is no pull request.');
    return;
  }

  const { base, head } = pr;
  if (![base.sha, head.sha].every((sha) => /^[0-9a-f]{40}$/.test(sha))) {
    throw new Error('Expected full PR base and head commit SHAs');
  }
  const revisionArgs = [`${base.sha}..${head.sha}`];
  if (base.ref.startsWith('upgrade/')) {
    revisionArgs.push('^refs/remotes/origin/main');
  }
  const commits = git('rev-list', ...revisionArgs, '--').trim().split('\n').filter(Boolean);
  let violations = 0;
  for (const sha of commits) {
    violations += reportAttribution(sha, git('show', '--no-show-signature', '-s', '--format=%B', sha, '--'));
  }
  violations += reportAttribution('PR body', readFileSync(bodyPath, 'utf8'));
  if (violations > 0) process.exitCode = 1;
}

main(process.argv[2], process.argv[3]);
