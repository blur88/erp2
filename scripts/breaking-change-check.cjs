'use strict';

// Validate a PR's release declaration and preview its merge result (#2002).
const { execFileSync } = require('node:child_process');
const { appendFileSync } = require('node:fs');
const { offlineGitOptions } = require('./release-preview/offline-git.cjs');
const { validateFields } = require('./release-preview/pr-fields.cjs');

const repository = 'blur88/erp2';
const staleMergeMessage = 'merge ref stale or unverifiable; re-run';
const cwd = process.cwd();
const gitOptions = offlineGitOptions(cwd);

function git(...args) {
  return execFileSync('git', args, { ...gitOptions, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function fetchGitHub(endpoint, description) {
  try {
    const result = execFileSync('gh', ['api', `repos/${repository}/${endpoint}`], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(result);
  } catch (error) {
    throw new Error(`Could not fetch ${description} with gh api.`, { cause: error });
  }
}

function fetchPullRequest(number) {
  return fetchGitHub(`pulls/${number}`, `current metadata for PR #${number}`);
}

function fetchMainTip() {
  return fetchGitHub('git/ref/heads/main', 'the live main tip')?.object?.sha;
}

function verifyMerge(metadata, mainTip) {
  try {
    const { base, head, merge_commit_sha: merge } = metadata ?? {};
    const shaPattern = /^[0-9a-f]{40}$/;
    if (base?.ref !== 'main' || ![merge, base?.sha, head?.sha, mainTip].every(value => typeof value === 'string' && shaPattern.test(value))) {
      throw new Error('GitHub did not return valid merge, base, head and live main SHAs for a PR targeting main.');
    }
    if (git('rev-parse', '--is-shallow-repository') !== 'false') {
      throw new Error('Full Git history is required.');
    }
    if (git('rev-list', '--parents', '-n', '1', 'HEAD') !== [merge, mainTip, head.sha].join(' ')) {
      throw new Error('HEAD and its two parents must match the current merge SHA, live main tip and PR head.');
    }
    git('cat-file', '-e', `${head.sha}^{commit}`);
    try {
      git('merge-base', '--is-ancestor', base.sha, mainTip);
    } catch (error) {
      throw new Error('The PR base SHA must be a locally verifiable ancestor of the live main tip.', { cause: error });
    }
    return { head: head.sha, merge };
  } catch (error) {
    throw new Error(`${staleMergeMessage}: ${error.message}`);
  }
}

function appendStepSummary(markdown) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

async function check() {
  const number = process.argv[2];
  if (process.argv.length !== 3 || !/^[1-9]\d*$/.test(number)) {
    throw new Error('Usage: node scripts/breaking-change-check.cjs <PR number>');
  }

  if (!process.env.GITHUB_STEP_SUMMARY) {
    throw new Error('Set GITHUB_STEP_SUMMARY to the path for the job summary.');
  }
  const metadata = fetchPullRequest(number);
  const mainTip = fetchMainTip();
  const { head, merge } = verifyMerge(metadata, mainTip);
  const breaking = validateFields(metadata.body, {
    repository,
    exists: path => /^100(?:644|755) blob /.test(
      git('--literal-pathspecs', 'ls-tree', '-z', '--full-tree', merge, '--', path)
    ),
  });
  const { classifyPullRequest, releasePreview } = await import('./release-preview/preview.mjs');
  const { type, commits } = await classifyPullRequest({ cwd, base: mainTip, head });
  for (const { hash, message } of commits) {
    if (/^[\w-]+(?:\([^\r\n)]+\))?!:/.test(message)) {
      throw new Error(`Commit ${hash} uses an unsupported ! header. Remove ! from the header and add a BREAKING CHANGE: footer if the commit introduces a break.`);
    }
  }

  if (breaking !== (type === 'major')) {
    const details = type === 'major' ? 'yes, or remove or move the BREAKING CHANGE: footer if the PR does not introduce the break'
      : 'no, or add or move a BREAKING CHANGE: footer to the commit that introduces the break';
    throw new Error(`Breaking change: the PR classification is ${type ?? 'no release'}. Set the declaration to ${details}. PR commits: ${commits.map(commit => commit.hash).join(', ')}.`);
  }

  const preview = await releasePreview({ cwd, head: merge });
  if (!preview.lastRelease) throw new Error(`${staleMergeMessage}: no reachable release tag found.`);

  const current = fetchPullRequest(number);
  const currentMainTip = fetchMainTip();
  if (current?.head?.sha !== head || currentMainTip !== mainTip) {
    throw new Error(`${staleMergeMessage}: the PR head or main tip changed during the check.`);
  }

  appendStepSummary([
    '## PR classification',
    `${breaking ? 'Breaking' : 'non-breaking'} (${type ?? 'no release'})`,
    '',
    '## Release preview',
    preview.version ? `${preview.version} (${preview.type})` : 'No release',
    ...preview.headings,
  ].join('\n'));
}

check().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendStepSummary(`## Breaking Change Check failed\n\n${error.message.split(/\r?\n/).map(line => `    ${line}`).join('\n')}`);
    } catch (summaryError) {
      console.error(`Could not write the job summary: ${summaryError.message}`);
    }
  }
});
