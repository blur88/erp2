const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { finalStageRunCommands } = require('../docker-image-pins.cjs');

function hasAlpineUpgrade(dockerfile) {
  // The upgrade starts the shell command and can be followed by package installs.
  return finalStageRunCommands(dockerfile).some((command) =>
    /^apk[ \t]+upgrade[ \t]+--no-cache(?:[ \t]*(?:&&|$)|[ \t]+#)/.test(command),
  );
}

for (const image of ['backend', 'frontend', 'nginx']) {
  const path = `${image}/Dockerfile`;
  test(`${path} upgrades Alpine packages without caching in the final stage`, () => {
    const dockerfile = readFileSync(resolve(__dirname, '../..', path), 'utf8');
    assert.ok(hasAlpineUpgrade(dockerfile), `${path} needs a final-stage RUN apk upgrade --no-cache`);
  });
}

test('accepts a single-line upgrade in the final stage', () => {
  assert.ok(hasAlpineUpgrade('FROM alpine\nRUN apk upgrade --no-cache # Apply security updates'));
});

test('accepts an upgrade split across lines with an interleaved Dockerfile comment', () => {
  const dockerfile = String.raw`FROM alpine
RUN apk upgrade \
    # Fetch updates without saving the index
    --no-cache && \
    apk add --no-cache curl`;
  assert.ok(hasAlpineUpgrade(dockerfile));
});

test('accepts the Dockerfile escape directive for line continuations', () => {
  const dockerfile = [
    '\uFEFF# syntax=docker/dockerfile:1',
    '# escape=`',
    'FROM alpine',
    'RUN apk upgrade `',
    '    --no-cache',
  ].join('\n');
  assert.ok(hasAlpineUpgrade(dockerfile));
});

test('accepts a final-stage upgrade with Dockerfile options and stage aliases', () => {
  const dockerfile = [
    'FROM --platform=$TARGETPLATFORM alpine AS Base',
    'from Base as production',
    'run --network=default apk upgrade --no-cache',
  ].join('\r\n');
  assert.ok(hasAlpineUpgrade(dockerfile));
});

test('keeps the legacy multiline upgrade together as a single command', () => {
  const dockerfile = String.raw`FROM alpine
RUN apk update && \
apk upgrade && \
apk add --no-cache curl`;
  assert.deepEqual(finalStageRunCommands(dockerfile), [
    'apk update && apk upgrade && apk add --no-cache curl',
  ]);
  assert.equal(hasAlpineUpgrade(dockerfile), false);
});

test('finds the final-stage upgrade after a heredoc contains a fake stage', () => {
  const dockerfile = [
    'FROM alpine',
    'COPY <<"NOTE\\$" /note',
    'FROM scratch',
    'NOTE$',
    'RUN apk upgrade --no-cache',
  ].join('\n');
  assert.deepEqual(finalStageRunCommands(dockerfile), ['apk upgrade --no-cache']);
});

const missingUpgrades = [
  ['upgrade in an earlier stage', [
    'FROM alpine AS builder',
    'RUN apk upgrade --no-cache',
    'FROM alpine AS production',
    'COPY --from=builder /app /app',
  ]],
  ['package installation only', ['FROM alpine', 'RUN apk add --no-cache curl']],
  ['upgrade in a Dockerfile comment', ['FROM alpine', '# RUN apk upgrade --no-cache']],
  ['upgrade in a shell comment', ['FROM alpine', 'RUN true # apk upgrade --no-cache']],
  ['upgrade printed as text', ['FROM alpine', "RUN echo 'upgrade && apk upgrade --no-cache'"]],
  ['upgrade without --no-cache', ['FROM alpine', 'RUN apk upgrade']],
  ['upgrade text in a continued instruction', ['FROM alpine', 'LABEL description=\\', 'RUN apk upgrade --no-cache']],
  ['upgrade text in a quoted COPY heredoc', [
    'FROM alpine',
    "COPY <<-'NOTE' /note",
    '\tRUN apk upgrade --no-cache',
    '\tNOTE',
  ]],
  ['an earlier upgrade before a heredoc with an escaped delimiter', [
    'FROM alpine AS builder',
    'RUN apk upgrade --no-cache',
    'COPY <<"NOTE\\$" /note',
    'text',
    'NOTE$',
    'FROM alpine AS production',
    'COPY --from=builder /note /note',
  ]],
];

for (const [description, lines] of missingUpgrades) {
  test(`rejects ${description}`, () => {
    assert.equal(hasAlpineUpgrade(lines.join('\n')), false);
  });
}
