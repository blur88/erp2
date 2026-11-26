// Check PR commit messages and the current PR body for AI attribution (#2083).
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');

const rules = [
  [
    'AI co-author trailer',
    /^\s*co-authored-by:\s*(?:(?:Claude(?:\s+(?:(?:Fable|Haiku|Opus|Sonnet)\s+\d|\d+(?:\.\d+)*\s+(?:Fable|Haiku|Opus|Sonnet)\b)[^<]*)?|Gemini|internal-model)\s*(?:<|$)|[^<]*<noreply@(?:anthropic\.com|google\.com)>)/i,
  ],
  ['Claude session link', /(?:^|[^\w.-])claude\.ai\/code\/[^\s)>]+/i],
  ['Claude session trailer', /^\s*claude-session:/i],
];

function reportAttribution(source, message) {
  for (const [index, line] of message.split(/\r?\n/).entries()) {
    for (const [rule, pattern] of rules) {
      if (pattern.test(line)) {
        console.error(`${source}:${index + 1}: ${rule}`);
        process.exitCode = 1;
      }
    }
  }
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
  for (const sha of commits) {
    reportAttribution(sha, git('show', '--no-show-signature', '-s', '--format=%B', sha, '--'));
  }
  reportAttribution('PR body', readFileSync(bodyPath, 'utf8'));
}

main(process.argv[2], process.argv[3]);
