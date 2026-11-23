'use strict';

const { dockerStages } = require('./dockerfile-instructions.cjs');

// Resolve Dockerfile stage aliases and Docker Hub image references (#2039).
function dockerStageImages(dockerfile) {
  return dockerStages(dockerfile).map(({ baseImage }) => baseImage);
}

function officialImagePin(image) {
  const pattern = /^(?:(?:docker\.io\/)?library\/|docker\.io\/)?(\w+):([\w.-]+)(?:@(sha256:[a-f0-9]{64}))?$/;
  const match = pattern.exec(image ?? '');
  if (!match) return;
  const [, repository, tag, pinnedDigest] = match;
  return { repository, tag, pinnedDigest };
}

module.exports = { dockerStageImages, officialImagePin };
