const { execFileSync } = require('node:child_process');
const { appendFileSync, readFileSync } = require('node:fs');
const { parse } = require('yaml');

const files = [
  'backend/Dockerfile',
  'frontend/Dockerfile',
  'nginx/Dockerfile',
  'docker-compose.yml',
  'docker-compose.prod.yml',
];

// Each series is an approved prefix of the numeric version. Keep the exact
// distribution version and image flavor from the pin when proposing updates.
const series = { node: '26', nginx: '1.30', postgres: '18', redis: '8.6' };
const catalog = 'https://github.com/docker-library/official-images/blob/master/library';
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const issueTitle = 'Docker base-image drift';
const marker = /^<!-- erp2-base-image-drift (.+) -->$/m;
const tagPattern = /^(\d+\.\d+(?:\.\d+)?)(-[\w.-]+)?$/;

function parsePins(sources) {
  const pins = new Map();
  for (const [file, content] of Object.entries(sources)) {
    const images = file.endsWith('Dockerfile')
      ? [...content.matchAll(/^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:[ \t]+AS[ \t]+(\S+))?/gim)]
        .filter((match, index, stages) =>
          !stages.slice(0, index).some((stage) => stage[2]?.toLowerCase() === match[1].toLowerCase()))
        .map((match) => [file, match[1]])
      : Object.entries(parse(content).services).map(([service, config]) => [
        `${file} (${service})`, config.image,
      ]);
    for (const [source, image] of images) {
      const match = /^(?:(?:docker\.io\/)?library\/|docker\.io\/)?(\w+):([^@]+)(?:@(sha256:[a-f0-9]{64}))?$/.exec(image ?? '');
      if (!match || !Object.hasOwn(series, match[1])) continue;
      const [, repository, tag, pinnedDigest] = match;
      const key = `${repository}:${tag}${pinnedDigest ? `@${pinnedDigest}` : ''}`;
      if (!pins.has(key)) pins.set(key, { repository, tag, pinnedDigest, sources: [] });
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

async function inspectPins(pins, registry, previous = {}) {
  return Promise.all(pins.map(async (pin) => {
    const { repository, tag } = pin;
    const reference = `${repository}:${tag}`;
    const result = { ...pin, unavailable: [] };
    const pinned = tagPattern.exec(tag);
    const approvedSeries = `${series[repository]}.`;
    if (!pinned || !pinned[1].startsWith(approvedSeries)) {
      result.unavailable.push(`pin is outside configured version series ${series[repository]}`);
      return result;
    }
    const [tags, digest] = await Promise.allSettled([
      registry.tags(repository),
      registry.digest(repository, tag),
    ]);
    result.baseline = pin.pinnedDigest ?? previous[reference];
    if (digest.status === 'fulfilled' && digestPattern.test(digest.value)) {
      result.observedDigest = digest.value;
      result.baseline ??= result.observedDigest;
    } else {
      result.unavailable.push(`current digest: ${digest.status === 'rejected' ? digest.reason.message : 'missing manifest digest'}`);
    }

    if (tags.status === 'rejected') {
      result.unavailable.push(`supported tags: ${tags.reason.message}`);
      return result;
    }
    const candidates = tags.value.filter((candidate) => {
      const parsed = tagPattern.exec(candidate);
      return parsed && parsed[1].startsWith(approvedSeries)
        && parsed[1].split('.').length === pinned[1].split('.').length
        && parsed[2] === pinned[2] && compareVersions(parsed[1], pinned[1]) > 0;
    }).sort((a, b) => compareVersions(tagPattern.exec(b)[1], tagPattern.exec(a)[1]));

    if (candidates.length) {
      try {
        const candidateDigest = await registry.digest(repository, candidates[0]);
        if (!digestPattern.test(candidateDigest)) throw new Error('missing manifest digest');
        result.candidate = candidates[0];
        result.candidateDigest = candidateDigest;
      } catch (error) {
        result.unavailable.push(`candidate ${candidates[0]}: ${error.message}`);
      }
    }
    return result;
  }));
}

function digestChanged(result) {
  return result.observedDigest && result.baseline && result.observedDigest !== result.baseline;
}

async function reportDrift(tracker, results, issue) {
  const baselines = {};
  const lines = results.map((result) => {
    const { repository, tag, pinnedDigest, sources, candidate, candidateDigest, observedDigest, baseline, unavailable } = result;
    const reference = `${repository}:${tag}`;
    if (baseline && !pinnedDigest) baselines[reference] = baseline;
    const statuses = [];
    if (candidate) statuses.push(`Newer compatible version: \`${repository}:${candidate}\` (\`${candidateDigest}\`)`);
    if (digestChanged(result)) statuses.push(`Changed digest: \`${baseline}\` → \`${observedDigest}\``);
    if (unavailable.length) statuses.push(`Lookup unavailable or inconclusive: ${unavailable.join('; ')}`);
    if (!statuses.length) statuses.push('No compatible update found');
    return [
      `- \`${reference}${pinnedDigest ? `@${pinnedDigest}` : ''}\` in ${sources.map((source) => `\`${source}\``).join(', ')}`,
      ...statuses.map((status) => `  - ${status}`),
      `  - [Supported tags](${catalog}/${repository}) · [Docker Hub tag evidence](${hubTag(repository, tag)})${observedDigest ? ` · Current digest \`${observedDigest}\`` : ''}`,
    ].join('\n');
  });
  const body = [
    'Scheduled check of external Dockerfile and Compose pins. For tag-only pins, the first observed digest is the comparison baseline.',
    ...lines,
  ].join('\n\n');
  const issueBody = `${body}\n\n<!-- erp2-base-image-drift ${JSON.stringify(baselines)} -->`;
  const actionable = results.some((result) => result.candidate || digestChanged(result) || result.unavailable.length);
  if (!issue) await tracker.create(issueBody);
  else if (issue.body !== issueBody || (issue.state === 'closed' && actionable)) {
    await tracker.update(issue.number, issueBody, issue.state === 'closed' && actionable);
  }
  return body;
}

function hubTag(repository, tag) {
  return `https://hub.docker.com/v2/namespaces/library/repositories/${repository}/tags/${tag}`;
}

async function get(url) {
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
        const response = await get(`https://raw.githubusercontent.com/docker-library/official-images/master/library/${repository}`);
        const tags = [...(await response.text()).matchAll(/^Tags: (.+)$/gm)]
          .flatMap((match) => match[1].split(', '));
        if (!tags.length) throw new Error('empty official tag catalog');
        return tags;
      })());
      return catalogs.get(repository);
    },
    digest(repository, tag) {
      const url = hubTag(repository, tag);
      if (!digests.has(url)) digests.set(url, (async () => (await (await get(url)).json()).digest)());
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
      .find((issue) => !issue.pull_request && marker.test(issue.body ?? '')),
    create: async (body) => api(['--method', 'POST', endpoint, '--input', '-'], { title: issueTitle, body }),
    update: async (number, body, reopen) => api(
      ['--method', 'PATCH', `${endpoint}/${number}`, '--input', '-'],
      { body, ...(reopen && { state: 'open' }) },
    ),
  };
}

async function checkDrift(sources, registry, tracker) {
  const issue = await tracker.find();
  const stored = marker.exec(issue?.body ?? '')?.[1];
  const results = await inspectPins(parsePins(sources), registry, stored ? JSON.parse(stored) : {});
  return reportDrift(tracker, results, issue);
}

async function main() {
  const sources = Object.fromEntries(files.map((file) => [file, readFileSync(file, 'utf8')]));
  const report = await checkDrift(sources, dockerRegistry(), githubTracker(process.env.GITHUB_REPOSITORY));
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
}

module.exports = { checkDrift, dockerRegistry, githubTracker, inspectPins, parsePins };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
