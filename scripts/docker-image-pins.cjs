'use strict';

const { dockerStages } = require('./dockerfile-instructions.cjs');

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
  const pattern = /^(?:(?:docker\.io\/)?library\/|docker\.io\/)?([\w.-]+)(?::([\w.-]+))?(?:@(sha256:[a-f0-9]{64}))?$/;
  const match = pattern.exec(image ?? '');
  if (!match) return;
  const [, repository, tag, pinnedDigest] = match;
  if (tag || pinnedDigest) return { repository, tag, pinnedDigest };
}

function officialImagePin(image) {
  const pin = officialImageReference(image);
  // Keep the tagged lookup used by the alignment tests compatible with its original names.
  if (pin?.tag && /^\w+$/.test(pin.repository)) return pin;
}

module.exports = { dockerStageImages, officialImagePin, officialImageReference };
