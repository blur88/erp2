'use strict';

const {
  classifyRelease,
  buildInternalChangesCommits,
  INTERNAL_TYPES,
  RELEASE_COMMIT_RE,
} = require('./scripts/release-notes-helpers.cjs');

const SHORT_HASH_LENGTH = 7;

let angularWriterTransformPromise;

function getShortHash(commit) {
  return typeof commit.hash === 'string' ? commit.hash.substring(0, SHORT_HASH_LENGTH) : commit.shortHash;
}

async function getAngularWriterTransform() {
  if (!angularWriterTransformPromise) {
    angularWriterTransformPromise = import('conventional-changelog-angular').then(async module => {
      const presetFactory = module.default || module;
      const preset = await presetFactory();

      return preset.writer.transform;
    });
  }

  return angularWriterTransformPromise;
}

async function transform(commit, context) {
  const angularTransform = await getAngularWriterTransform();
  const transformed = await angularTransform(commit, context);

  if (transformed) {
    return transformed;
  }

  if (!commit.type || !INTERNAL_TYPES.has(commit.type) || RELEASE_COMMIT_RE.test(commit.header || '')) {
    return transformed;
  }

  const scope = commit.scope === '*' ? '' : commit.scope;
  const scopeText = scope ? `(${scope})` : '';

  return {
    notes: [],
    references: [],
    type: 'Internal Changes',
    scope: '',
    shortHash: getShortHash(commit),
    subject: `${commit.type}${scopeText}: ${commit.subject || commit.header}`,
  };
}

/**
 * finalizeContext hook for @semantic-release/release-notes-generator.
 *
 * Signature: finalizeContext(templateContext, options, filteredCommits, keyCommit, allCommits)
 *   - templateContext: the writer context being rendered (has .commitGroups)
 *   - filteredCommits: transformed commits included in the rendered release notes
 *   - allCommits: transformed commit list passed by conventional-changelog-writer; may be empty
 *
 * Behavior:
 *   - If any user-facing commit (feat/fix/perf) exists: return templateContext without the synthetic internal group.
 *   - Otherwise: replace commitGroups with a single 'Internal Changes' group.
 */
function finalizeContext(templateContext, options, filteredCommits, keyCommit, allCommits) {
  const commits = allCommits && allCommits.length > 0 ? allCommits : filteredCommits;

  if (!commits || commits.length === 0) {
    console.warn(
      '[release.config.cjs] WARNING: finalizeContext received no commits to classify. ' +
        'This may indicate a conventional-changelog-writer version incompatibility.'
    );
    return templateContext;
  }

  const classification = classifyRelease(commits);

  if (classification === 'user-facing') {
    templateContext.commitGroups = (templateContext.commitGroups || []).filter(group => group.title !== 'Internal Changes');
    return templateContext;
  }

  const entries = buildInternalChangesCommits(commits);

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
        writerOpts: { transform, finalizeContext },
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
