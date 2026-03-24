'use strict';

const { classifyRelease, buildInternalChangesCommits } = require('./scripts/release-notes-helpers.cjs');

/**
 * finalizeContext hook for @semantic-release/release-notes-generator.
 *
 * Signature: finalizeContext(templateContext, options, filteredCommits, keyCommit, allCommits)
 *   - templateContext: the writer context being rendered (has .commitGroups)
 *   - filteredCommits: post-transform commits - internal types already stripped, do NOT use for classification
 *   - allCommits: pre-transform full commit list - use this for classification
 *
 * Behavior:
 *   - If any user-facing commit (feat/fix/perf) exists: return templateContext unchanged.
 *   - Otherwise: replace commitGroups with a single 'Internal Changes' group.
 */
function finalizeContext(templateContext, options, filteredCommits, keyCommit, allCommits) {
  if (!allCommits || allCommits.length === 0) {
    console.warn(
      '[release.config.cjs] WARNING: allCommits (5th arg to finalizeContext) is empty or undefined. ' +
        'This may indicate a conventional-changelog-writer version incompatibility. ' +
        'Falling back to filteredCommits - internal-only detection may be unreliable.'
    );
    return templateContext;
  }

  const classification = classifyRelease(allCommits);

  if (classification === 'user-facing') {
    return templateContext;
  }

  const entries = buildInternalChangesCommits(allCommits);

  if (entries.length === 0) {
    console.warn(
      '[release.config.cjs] WARNING: Internal-only release detected but no internal commits found to display. ' +
        'Emitting placeholder entry to prevent empty release notes.'
    );
    entries.push('see commit history for this release');
  }

  templateContext.commitGroups = [
    {
      title: 'Internal Changes',
      commits: entries.map(entry => ({ subject: entry })),
    },
  ];

  return templateContext;
}

module.exports = {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        releaseRules: [
          { type: 'chore', scope: 'release', release: false },
          { type: 'chore', release: 'patch' },
          { type: 'style', release: 'patch' },
          { type: 'refactor', release: 'patch' },
        ],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        writerOpts: { finalizeContext },
      },
    ],
    '@semantic-release/changelog',
    [
      '@semantic-release/npm',
      {
        pkgRoot: 'backend',
        npmPublish: false,
      },
    ],
    [
      '@semantic-release/npm',
      {
        pkgRoot: 'frontend',
        npmPublish: false,
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'backend/package.json', 'frontend/package.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]',
      },
    ],
    '@semantic-release/github',
  ],
};
