'use strict';

// Resolve Dockerfile stage aliases and Docker Hub image references (#2039).
function dockerStageImages(dockerfile) {
  const aliases = new Map();
  const pattern = /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:[ \t]+AS[ \t]+(\S+))?/gim;
  return [...dockerfile.matchAll(pattern)].map(([, base, alias]) => {
    const image = aliases.get(base.toLowerCase()) ?? base;
    if (alias) aliases.set(alias.toLowerCase(), image);
    return image;
  });
}

function officialImagePin(image) {
  const pattern = /^(?:(?:docker\.io\/)?library\/|docker\.io\/)?(\w+):([\w.-]+)(?:@(sha256:[a-f0-9]{64}))?$/;
  const match = pattern.exec(image ?? '');
  if (!match) return;
  const [, repository, tag, pinnedDigest] = match;
  return { repository, tag, pinnedDigest };
}

module.exports = { dockerStageImages, officialImagePin };
