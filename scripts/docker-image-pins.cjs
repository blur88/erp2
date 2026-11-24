'use strict';

const { dockerStages } = require('./dockerfile-instructions.cjs');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { basename, resolve } = require('node:path');

const officialImagePattern = /^(?:(?:docker\.io\/)?library\/|docker\.io\/)?([\w.-]+)(?::([\w.-]+))?(?:@(sha256:[a-f0-9]{64}))?$/;
const composeName = /^(?:docker-)?compose(?:[.-].+)?\.ya?ml$/;

function isComposeFile(file) {
  return composeName.test(basename(file));
}

function readRepositorySources(root, includesFile) {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root, encoding: 'utf8',
  }).split('\0').filter(includesFile);
  const sources = {};
  for (const file of files) {
    try {
      sources[file] = readFileSync(resolve(root, file), 'utf8');
    } catch (error) {
      // The index can still list files deleted from the working tree.
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return sources;
}

// Resolve Dockerfile stage aliases and Docker Hub image references (#2039).
function dockerStageImages(dockerfile) {
  const stages = dockerStages(dockerfile);
  if (stages) return stages.map(({ baseImage }) => baseImage);

  // Keep scanning raw FROM lines for drift when stage parsing is incomplete.
  const aliases = new Map();
  const pattern = /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:[ \t]+AS[ \t]+(\S+))?/gim;
  return [...dockerfile.matchAll(pattern)].map(([, base, alias]) => {
    const image = aliases.get(base.toLowerCase()) ?? base;
    if (alias) aliases.set(alias.toLowerCase(), image);
    return image;
  });
}

function officialImageReference(image) {
  const match = officialImagePattern.exec(image ?? '');
  if (!match) return;
  const [, repository, tag, pinnedDigest] = match;
  if (tag || pinnedDigest) return { repository, tag, pinnedDigest };
}

function officialImagePin(image) {
  const pin = officialImageReference(image);
  // Keep the tagged lookup used by the alignment tests compatible with its original names.
  if (pin?.tag && /^\w+$/.test(pin.repository)) return pin;
}

function officialImageRepository(image) {
  return officialImagePattern.exec(image)?.[1];
}

module.exports = {
  dockerStageImages, isComposeFile, officialImagePin, officialImageReference,
  officialImageRepository, readRepositorySources,
};
