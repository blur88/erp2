'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { classifyRelease, buildInternalChangesCommits } = require('./release-notes-helpers.cjs');

const DRY_RUN = process.argv.includes('--dry-run');
const REPO_ROOT = path.resolve(__dirname, '..');
const CHANGELOG_PATH = path.join(REPO_ROOT, 'CHANGELOG.md');

const TARGET_TAGS = [
  'v1.14.1',
  'v1.15.1',
  'v1.17.1',
  'v1.17.2',
  'v1.18.1',
  'v1.19.1',
  'v1.21.1',
  'v1.22.1',
  'v1.22.2',
  'v1.22.3',
];

const SEMVER_TAG_RE = /^v\d+\.\d+\.\d+$/;
const CONV_COMMIT_RE = /^([a-z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/;

function run(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function warn(message) {
  process.stderr.write(`[WARN] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[ERROR] ${message}\n`);
  process.exit(1);
}

function getAllReleaseTags() {
  return run('git tag --sort=version:refname')
    .split('\n')
    .filter(tag => SEMVER_TAG_RE.test(tag));
}

function getPreviousTag(currentTag, allTags) {
  const index = allTags.indexOf(currentTag);
  if (index <= 0) {
    return null;
  }

  return allTags[index - 1];
}

function getCommitsInRange(previousTag, currentTag) {
  const output = run(`git log ${previousTag}..${currentTag} --format="%H %s"`);
  if (!output) {
    return [];
  }

  return output.split('\n').map(line => {
    const firstSpace = line.indexOf(' ');
    const hash = line.slice(0, firstSpace);
    const subject = line.slice(firstSpace + 1);
    const header = subject;
    const match = CONV_COMMIT_RE.exec(subject);

    if (match) {
      return {
        hash,
        type: match[1],
        scope: match[2] || null,
        subject: match[3],
        header,
      };
    }

    return {
      hash,
      type: null,
      scope: null,
      subject,
      header,
    };
  });
}

function buildMarkdown(entries) {
  const bullets = entries.map(entry => `* ${entry}`).join('\n');
  return `\n\n### Internal Changes\n\n${bullets}\n`;
}

function getChangelogSection(version) {
  const content = fs.readFileSync(CHANGELOG_PATH, 'utf8').replace(/\r\n/g, '\n');
  const sectionHeader = `## [${version}]`;
  const startIndex = content.indexOf(sectionHeader);

  if (startIndex === -1) {
    fail(`Cannot locate section "${sectionHeader}" in CHANGELOG.md`);
  }

  const afterHeaderIndex = content.indexOf('\n', startIndex);
  const nextSectionOffset = content.slice(afterHeaderIndex + 1).search(/^#{1,2} \[/m);
  const endIndex = nextSectionOffset === -1 ? content.length : afterHeaderIndex + 1 + nextSectionOffset;
  const body = content.slice(afterHeaderIndex + 1, endIndex);

  return { content, afterHeaderIndex, endIndex, body };
}

function patchChangelog(version, markdown) {
  const { content, afterHeaderIndex, endIndex, body } = getChangelogSection(version);

  if (body.trim() !== '') {
    warn(`CHANGELOG section for ${version} already has content - skipping (idempotent)`);
    return false;
  }

  const updated = content.slice(0, afterHeaderIndex) + markdown + content.slice(endIndex);

  if (DRY_RUN) {
    log(`\n[DRY-RUN] Would patch CHANGELOG.md for ${version}:`);
    log('---');
    log(markdown.trim());
    log('---');
  } else {
    fs.writeFileSync(CHANGELOG_PATH, updated, 'utf8');
    log(`Patched CHANGELOG.md for ${version}`);
  }

  return true;
}

function getGitHubReleaseBody(tag) {
  try {
    return run(`gh release view ${tag} --json body --jq '.body'`);
  } catch (error) {
    fail(`Cannot fetch GitHub release for ${tag}: ${error.message}`);
  }
}

function hasMeaningfulReleaseBody(body) {
  return body
    .replace(/^## \[[^\]]+\]\([^)]+\) \(\d{4}-\d{2}-\d{2}\)\n*/m, '')
    .trim() !== '';
}

function updateGitHubRelease(tag, markdown, existingBody = getGitHubReleaseBody(tag)) {
  if (existingBody && hasMeaningfulReleaseBody(existingBody)) {
    warn(`GitHub Release ${tag} already has content - skipping (idempotent)`);
    return;
  }

  const releaseNotes = `### Internal Changes\n\n${markdown.trim().replace(/^### Internal Changes\n\n/, '')}`;

  if (DRY_RUN) {
    log(`[DRY-RUN] Would update GitHub Release ${tag} with:`);
    log('---');
    log(releaseNotes.trim());
    log('---');
    return;
  }

  const tmpFile = path.join(REPO_ROOT, `.gh-notes-${tag}.tmp`);
  fs.writeFileSync(tmpFile, releaseNotes, 'utf8');

  try {
    run(`gh release edit ${tag} --notes-file ${JSON.stringify(tmpFile)}`);
    log(`Updated GitHub Release ${tag}`);
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}

async function main() {
  log(DRY_RUN ? '=== DRY RUN MODE ===' : '=== LIVE RUN ===');

  const allTags = getAllReleaseTags();
  log(`Found ${allTags.length} strict-semver release tags`);

  for (const tag of TARGET_TAGS) {
    const version = tag.replace(/^v/, '');
    log(`\n--- Processing ${tag} ---`);

    if (!allTags.includes(tag)) {
      fail(`Tag ${tag} not found in repository`);
    }

    const changelogSection = getChangelogSection(version);
    const existingReleaseBody = getGitHubReleaseBody(tag);
    const needsChangelogPatch = changelogSection.body.trim() === '';
    const needsReleasePatch = !hasMeaningfulReleaseBody(existingReleaseBody);

    if (!needsChangelogPatch && !needsReleasePatch) {
      warn(`CHANGELOG section and GitHub Release for ${tag} already have content - skipping (idempotent)`);
      continue;
    }

    const previousTag = getPreviousTag(tag, allTags);
    if (!previousTag) {
      fail(`Cannot resolve previous tag for ${tag} - it appears to be the first tag`);
    }
    log(`  Range: ${previousTag}..${tag}`);

    const commits = getCommitsInRange(previousTag, tag);
    if (commits.length === 0) {
      fail(`Zero commits found in range ${previousTag}..${tag} - this is unexpected. Check tag resolution.`);
    }
    log(`  Commits in range: ${commits.length}`);

    if (classifyRelease(commits) === 'user-facing') {
      fail(
        `User-facing commit (feat/fix/perf) found in ${tag} which was expected to be empty. ` +
          `Manual review required. Range: ${previousTag}..${tag}`
      );
    }

    const entries = buildInternalChangesCommits(commits);
    if (entries.length === 0) {
      warn(`No internal commits found for ${tag} after filtering - using placeholder`);
      entries.push('see commit history for this release');
    }

    const markdown = buildMarkdown(entries);
    patchChangelog(version, markdown);
    updateGitHubRelease(tag, markdown, existingReleaseBody);
  }

  log('\n=== Done ===');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
