'use strict';

const INTERNAL_TYPES = new Set(['chore', 'refactor', 'docs', 'style']);
const USER_FACING_TYPES = new Set(['feat', 'fix', 'perf']);
const RELEASE_COMMIT_RE = /^chore\(release\):/;

function classifyRelease(allCommits) {
  const significant = allCommits.filter(c => c.type && !RELEASE_COMMIT_RE.test(c.header || ''));
  if (significant.some(c => USER_FACING_TYPES.has(c.type))) return 'user-facing';
  return 'internal-only';
}

function buildInternalChangesCommits(allCommits) {
  return allCommits
    .filter(c => !RELEASE_COMMIT_RE.test(c.header || ''))
    .filter(c => c.type && INTERNAL_TYPES.has(c.type))
    .map(c => {
      const scope = c.scope ? `(${c.scope})` : '';
      return `${c.type}${scope}: ${c.subject || c.header}`;
    });
}

module.exports = {
  classifyRelease,
  buildInternalChangesCommits,
  INTERNAL_TYPES,
  USER_FACING_TYPES,
  RELEASE_COMMIT_RE,
};
