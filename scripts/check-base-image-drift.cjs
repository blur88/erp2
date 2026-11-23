'use strict';

// Report Docker base-image drift without modifying pins (#2039).
const { execFileSync } = require('node:child_process');
const { appendFileSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const { parse } = require('yaml');
const { dockerStageImages, officialImagePin } = require('./docker-image-pins.cjs');

const pinnedImageFiles = [
  'backend/Dockerfile',
  'frontend/Dockerfile',
  'nginx/Dockerfile',
  'docker-compose.yml',
  'docker-compose.prod.yml',
];

// Each series is an approved prefix of the numeric version. Keep the exact
// distribution version and image flavor from the pin when proposing updates.
const approvedSeries = { node: '26', nginx: '1.30', postgres: '18', redis: '8.6' };
const officialImagesCatalogUrl = 'https://github.com/docker-library/official-images/blob/master/library';
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const issueTitle = 'Docker base-image drift';
const managedStart = '<!-- erp2-base-image-drift:start -->';
const managedEnd = '<!-- erp2-base-image-drift:end -->';
const managedSection = /^<!-- erp2-base-image-drift:start -->\r?\n[\s\S]*?^<!-- erp2-base-image-drift:end -->$/m;
const artifactName = 'docker-base-image-drift-state';
const tagPattern = /^(\d+\.\d+(?:\.\d+)?)(-[\w.-]+)?$/;

function parsePins(sources) {
  const pins = new Map();
  for (const [file, content] of Object.entries(sources)) {
    const images = file.endsWith('Dockerfile')
      ? dockerStageImages(content).map((image) => [file, image])
      : Object.entries(parse(content).services).map(([service, config]) => [
        `${file} (${service})`, config.image,
      ]);
    for (const [source, image] of images) {
      const pin = officialImagePin(image);
      if (!pin || !Object.hasOwn(approvedSeries, pin.repository)) continue;
      const key = pinReference(pin);
      if (!pins.has(key)) pins.set(key, { ...pin, sources: [] });
      const { sources: locations } = pins.get(key);
      if (!locations.includes(source)) locations.push(source);
    }
  }
  return [...pins.values()];
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function pinReference({ repository, tag, pinnedDigest }) {
  return `${repository}:${tag}${pinnedDigest ? `@${pinnedDigest}` : ''}`;
}

function selectCandidate(tags, series, pinned) {
  const sameSeries = tags.map((tag) => tagPattern.exec(tag)).filter((tag) =>
    tag && tag[1].startsWith(series) && tag[1].split('.').length === pinned[1].split('.').length);
  const exactVariant = sameSeries.filter((tag) => tag[2] === pinned[2]);
  const latest = (variants) => variants.sort((a, b) => compareVersions(b[1], a[1]))[0];
  const newer = exactVariant.filter((tag) => compareVersions(tag[1], pinned[1]) > 0);
  if (newer.length) return { tag: latest(newer)[0], variantReview: false };
  if (exactVariant.length) return;

  // The pinned variant has left this series. Surface a manual review only
  // when the catalog has moved to a newer Alpine release with the same flavor.
  const alpineVariant = /^-alpine(\d+\.\d+)(.*)$/;
  const alpine = alpineVariant.exec(pinned[2] ?? '');
  if (!alpine) return;
  const alternatives = sameSeries.filter((tag) => {
    const variant = alpineVariant.exec(tag[2] ?? '');
    return variant && variant[2] === alpine[2]
      && compareVersions(variant[1], alpine[1]) > 0
      && compareVersions(tag[1], pinned[1]) >= 0;
  });
  if (alternatives.length) {
    alternatives.sort((a, b) => compareVersions(b[1], a[1])
      || compareVersions(alpineVariant.exec(b[2])[1], alpineVariant.exec(a[2])[1]));
    return { tag: alternatives[0][0], variantReview: true };
  }
  return { variantReview: true };
}

async function inspectPins(pins, registry, previous = {}) {
  return Promise.all(pins.map(async (pin) => {
    const { repository, tag } = pin;
    const result = { ...pin, unavailable: [] };
    const pinned = tagPattern.exec(tag);
    const series = `${approvedSeries[repository]}.`;
    if (!pinned || !pinned[1].startsWith(series)) {
      result.unavailable.push(`pin is outside configured version series ${approvedSeries[repository]}`);
      return result;
    }
    const [tags, digest] = await Promise.allSettled([
      registry.tags(repository),
      registry.digest(repository, tag),
    ]);
    result.baseline = previous[pinReference(pin)]?.digest ?? pin.pinnedDigest;
    if (digest.status === 'fulfilled' && digestPattern.test(digest.value)) {
      result.observedDigest = digest.value;
    } else {
      result.unavailable.push(`current digest: ${digest.status === 'rejected' ? digest.reason.message : 'missing manifest digest'}`);
    }

    if (tags.status === 'rejected') {
      result.unavailable.push(`supported tags: ${tags.reason.message}`);
      return result;
    }
    const candidate = selectCandidate(tags.value, series, pinned);
    result.variantReview = candidate?.variantReview ?? false;
    if (!candidate?.tag) {
      result.candidate = null;
      return result;
    }
    try {
      const candidateDigest = await registry.digest(repository, candidate.tag);
      if (!digestPattern.test(candidateDigest)) throw new Error('missing manifest digest');
      result.candidate = candidate.tag;
      result.candidateDigest = candidateDigest;
    } catch (error) {
      result.unavailable.push(`candidate ${candidate.tag}: ${error.message}`);
    }
    return result;
  }));
}

function digestChanged(result) {
  return result.observedDigest && result.baseline && result.observedDigest !== result.baseline;
}

function renderResult(result, includeAvailability) {
  const { repository, tag, sources, candidate, candidateDigest, observedDigest, baseline, unavailable } = result;
  const statuses = [];
  if (candidate) {
    const label = result.variantReview ? 'Alpine variant retired, review newer variant' : 'Newer compatible version';
    statuses.push(`${label}: [\`${repository}:${candidate}\`](${hubTag(repository, candidate)}) (\`${candidateDigest}\`)`);
  }
  if (!candidate && result.variantReview) statuses.push('Pinned Alpine variant is absent from the supported tag catalog for this series');
  if (digestChanged(result)) statuses.push(`Changed digest: \`${baseline}\` → \`${observedDigest}\``);
  if (includeAvailability && unavailable.length) {
    statuses.push(`Lookup unavailable or inconclusive: ${unavailable.join('; ')}`);
  }
  if (!statuses.length) statuses.push('No compatible update found');
  return [
    `- \`${pinReference(result)}\` in ${sources.map((source) => `\`${source}\``).join(', ')}`,
    ...statuses.map((status) => `  - ${status}`),
    `  - [Supported tags](${officialImagesCatalogUrl}/${repository}) · [Docker Hub tag evidence](${hubTag(repository, tag)})${observedDigest ? ` · Current digest \`${observedDigest}\`` : ''}`,
  ].join('\n');
}

async function updateTrackingIssue(tracker, results, previous) {
  const findings = results.filter((result) => result.candidate || digestChanged(result));
  if (!findings.length) return;
  const issue = await tracker.find();
  const hasNewFinding = findings.some((result) => digestChanged(result)
    || (result.candidate && result.candidate !== previous[pinReference(result)]?.candidate));
  if (issue && !hasNewFinding) return;

  const section = [
    managedStart,
    '### Most recent reported Docker base-image drift',
    'Keep maintainer notes outside this generated section.',
    ...findings.map((result) => renderResult(result, false)),
    managedEnd,
  ].join('\n\n');
  if (!issue) {
    await tracker.create(section);
    return;
  }
  const body = issue.body.replace(managedSection, () => section);
  if (body !== issue.body) await tracker.update(issue.number, body);
}

function hubTag(repository, tag) {
  return `https://hub.docker.com/v2/namespaces/library/repositories/${repository}/tags/${tag}`;
}

async function fetchRegistryEvidence(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response;
}

function dockerRegistry() {
  const catalogs = new Map();
  const digests = new Map();
  return {
    tags(repository) {
      if (!catalogs.has(repository)) catalogs.set(repository, (async () => {
        const response = await fetchRegistryEvidence(`https://raw.githubusercontent.com/docker-library/official-images/master/library/${repository}`);
        const tags = [...(await response.text()).matchAll(/^Tags: (.+)$/gm)]
          .flatMap((match) => match[1].split(', '));
        if (!tags.length) throw new Error('empty official tag catalog');
        return tags;
      })());
      return catalogs.get(repository);
    },
    digest(repository, tag) {
      const url = hubTag(repository, tag);
      if (!digests.has(url)) digests.set(url, (async () => (await (await fetchRegistryEvidence(url)).json()).digest)());
      return digests.get(url);
    },
  };
}

function githubApi(args, payload) {
  return JSON.parse(execFileSync('gh', ['api', ...args], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    input: payload && JSON.stringify(payload),
  }));
}

function githubTracker(repository, api = githubApi) {
  const endpoint = `repos/${repository}/issues`;
  return {
    find: async () => api(['--paginate', '--slurp', `${endpoint}?state=all&creator=github-actions%5Bbot%5D&per_page=100`])
      .flat()
      .find((issue) => !issue.pull_request && managedSection.test(issue.body ?? '')),
    create: async (body) => api(['--method', 'POST', endpoint, '--input', '-'], { title: issueTitle, body }),
    update: async (number, body) => api(
      ['--method', 'PATCH', `${endpoint}/${number}`, '--input', '-'],
      { body },
    ),
  };
}

async function checkDrift(sources, registry, tracker, previous = {}) {
  const results = await inspectPins(parsePins(sources), registry, previous);
  await updateTrackingIssue(tracker, results, previous);
  const state = Object.fromEntries(results.map((result) => {
    const reference = pinReference(result);
    return [reference, {
      digest: result.observedDigest ?? previous[reference]?.digest,
      candidate: result.candidate === undefined ? previous[reference]?.candidate : result.candidate,
    }];
  }));
  const report = results.map((result) => renderResult(result, true)).join('\n\n');
  return { report, state };
}

function restoreState(repository, stateFile) {
  const { artifacts } = githubApi([`repos/${repository}/actions/artifacts?name=${artifactName}&per_page=100`]);
  const latest = artifacts.filter((artifact) => !artifact.expired
    && artifact.workflow_run?.head_branch === process.env.GITHUB_REF_NAME)
    .sort((a, b) => b.id - a.id)[0];
  if (!latest) return {};
  execFileSync('gh', [
    'run', 'download', String(latest.workflow_run.id),
    '--repo', repository, '--name', artifactName, '--dir', dirname(stateFile),
  ], { stdio: 'inherit' });
  return JSON.parse(readFileSync(stateFile, 'utf8'));
}

async function main() {
  const sources = Object.fromEntries(pinnedImageFiles.map((file) => [file, readFileSync(file, 'utf8')]));
  const repository = process.env.GITHUB_REPOSITORY;
  const stateFile = process.env.DRIFT_STATE_FILE;
  const previous = restoreState(repository, stateFile);
  const { report, state } = await checkDrift(sources, dockerRegistry(), githubTracker(repository), previous);
  writeFileSync(stateFile, JSON.stringify(state));
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
}

module.exports = { checkDrift, compareVersions, dockerRegistry, githubTracker, inspectPins, parsePins };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
