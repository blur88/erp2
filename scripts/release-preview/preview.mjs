// These private imports depend on the semantic-release 25.0.3 pin.
// Run the historical replay when upgrading semantic-release.
import getConfig from 'semantic-release/lib/get-config.js';
import getTags from 'semantic-release/lib/branches/get-tags.js';
import getLastRelease from 'semantic-release/lib/get-last-release.js';
import getCommits from 'semantic-release/lib/get-commits.js';
import getNextVersion from 'semantic-release/lib/get-next-version.js';
import { getTagHead } from 'semantic-release/lib/git.js';
import { makeTag } from 'semantic-release/lib/utils.js';
import { offlineGitOptions } from './offline-git.cjs';

const logger = { log() {}, info() {}, warn() {}, error() {}, success() {}, scope: () => logger };
const nullStream = { write: () => true };

function httpsRepositoryUrl(repositoryUrl) {
  const sshRemote = /^(?:[^@/]+@)?([^:/]+):([^/].*)$/.exec(repositoryUrl);
  const url = new URL(sshRemote ? `https://${sshRemote[1]}/${sshRemote[2]}` : repositoryUrl);
  if (!url.hostname || !['https:', 'http:', 'ssh:', 'git:', 'git+https:', 'git+ssh:'].includes(url.protocol)) {
    throw new Error('Release preview requires a remote repository URL.');
  }

  const host = ['https:', 'http:', 'git+https:'].includes(url.protocol) ? url.host : url.hostname;
  return `https://${host}${url.pathname}`;
}

/**
 * Predict a release on main using local Git history and semantic-release's
 * analyzer and notes pipelines. For replay, visibleTags limits which reachable
 * tags are supplied to the pipelines.
 * configDirectory defaults to the checkout and can point to a staged config.
 */
export async function releasePreview({ cwd, head, visibleTags, configDirectory = cwd, plugins, repositoryUrl }) {
  const gitOptions = offlineGitOptions(cwd);
  const context = { ...gitOptions, logger, stdout: nullStream, stderr: nullStream };
  const overrides = {
    ...(plugins && { plugins }),
    ...(repositoryUrl && { repositoryUrl }),
  };
  const { options, plugins: pluginSteps } = await getConfig(
    { ...context, cwd: configDirectory },
    overrides
  );
  options.repositoryUrl = httpsRepositoryUrl(options.repositoryUrl);
  const [{ tags: reachableTags }] = await getTags({ ...context, options }, [{ name: head }]);
  const tags = visibleTags ? reachableTags.filter(({ gitTag }) => visibleTags.has(gitTag)) : reachableTags;
  const branch = { name: 'main', type: 'release', main: true, range: '>=0.0.0', tags };
  const releaseContext = { ...context, options, branch, branches: [branch] };
  const lastRelease = getLastRelease(releaseContext);
  if (lastRelease.gitHead) {
    lastRelease.gitHead = await getTagHead(lastRelease.gitHead, gitOptions);
  }

  const commits = await getCommits({ ...releaseContext, lastRelease, nextRelease: { gitHead: head } });
  const analysisContext = { ...releaseContext, lastRelease, commits };
  const releaseType = await pluginSteps.analyzeCommits(analysisContext);
  const result = { type: releaseType ?? null, lastRelease: lastRelease.gitTag ?? null, commits };
  if (!releaseType) {
    return { ...result, version: null, headings: [] };
  }

  const nextRelease = { type: releaseType, channel: null, gitHead: head };
  nextRelease.version = getNextVersion({ ...analysisContext, nextRelease });
  nextRelease.gitTag = makeTag(options.tagFormat, nextRelease.version);
  nextRelease.name = nextRelease.gitTag;
  const notes = await pluginSteps.generateNotes({ ...analysisContext, nextRelease });
  const headings = notes.split('\n').filter(line => line.startsWith('### ')).map(line => line.trim());
  return { ...result, version: nextRelease.version, headings };
}
