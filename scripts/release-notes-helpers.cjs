'use strict';

const INTERNAL_TYPES = new Set(['chore', 'refactor', 'docs', 'style']);
const USER_FACING_TYPES = new Set(['feat', 'fix', 'perf']);
const RELEASE_COMMIT_RE = /^chore\(release\):/;

function getCommitType(commit) {
  return commit.raw?.type || commit.type;
}

function getCommitScope(commit) {
  return commit.raw?.scope ?? commit.scope;
}

function getCommitSubject(commit) {
  return commit.raw?.subject || commit.subject || commit.header;
}

function getCommitHeader(commit) {
  return commit.raw?.header || commit.header || '';
}

function classifyRelease(allCommits) {
  const significant = allCommits.filter(commit => {
    const type = getCommitType(commit);
    return type && !RELEASE_COMMIT_RE.test(getCommitHeader(commit));
  });

  if (significant.some(commit => USER_FACING_TYPES.has(getCommitType(commit)))) return 'user-facing';
  return 'internal-only';
}

function buildInternalChangesCommits(allCommits) {
  return allCommits
    .filter(commit => !RELEASE_COMMIT_RE.test(getCommitHeader(commit)))
    .filter(commit => {
      const type = getCommitType(commit);
      return type && INTERNAL_TYPES.has(type);
    })
    .map(commit => {
      const type = getCommitType(commit);
      const scope = getCommitScope(commit);
      const subject = getCommitSubject(commit);
      const scopeText = scope ? `(${scope})` : '';

      return `${type}${scopeText}: ${subject}`;
    });
}

module.exports = {
  classifyRelease,
  buildInternalChangesCommits,
  INTERNAL_TYPES,
  USER_FACING_TYPES,
  RELEASE_COMMIT_RE,
};
