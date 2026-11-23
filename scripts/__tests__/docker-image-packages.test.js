const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { parse } = require('yaml');
const { dockerStages } = require('../dockerfile-instructions.cjs');

function publishedStage(dockerfile, target) {
  const stages = dockerStages(dockerfile) ?? [];
  return target ? stages.find(({ alias }) => alias?.toLowerCase() === target.toLowerCase()) : stages.at(-1);
}

function isAlpineBase(image) {
  const [reference] = image.split('@');
  const name = reference.slice(reference.lastIndexOf('/') + 1);
  return /^alpine(?::|$)/.test(name) || /:(?:[^:]+-)?alpine(?:\d+(?:\.\d+)*)?(?:-|$)/.test(name);
}

function hasAlpineUpgrade({ runCommands }) {
  // The upgrade starts the shell command and can be followed by package installs.
  return runCommands.some((command) =>
    /^apk[ \t]+upgrade[ \t]+--no-cache(?:[ \t]*(?:&&|$)|[ \t]+#)/.test(command),
  );
}

function assertPublishedAlpineUpgrade(dockerfile, path, target) {
  const stage = publishedStage(dockerfile, target);
  assert.ok(stage, `${path}: cannot find published stage ${target ?? '(last stage)'}`);
  assert.ok(!stage.baseImage.includes('$'),
    `${path}: cannot determine whether published base image ${stage.baseImage} uses Alpine`);
  if (isAlpineBase(stage.baseImage)) {
    assert.ok(hasAlpineUpgrade(stage), `${path} needs RUN apk upgrade --no-cache in the published stage`);
  }
}

const root = resolve(__dirname, '../..');
const workflow = parse(readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8'));
const publishedImages = Object.values(workflow.jobs)
  .flatMap(({ steps = [] }) => steps)
  .filter((step) => step.uses?.startsWith('docker/build-push-action@') && step.with?.push === true);

test('the release workflow defines images to check', () => {
  assert.ok(publishedImages.length > 0);
});

for (const { name, with: options } of publishedImages) {
  test(`${name} upgrades packages when the published stage uses Alpine`, () => {
    const path = options.file ?? join(options.context ?? '.', 'Dockerfile');
    const dockerfile = readFileSync(resolve(root, path), 'utf8');
    assertPublishedAlpineUpgrade(dockerfile, path, options.target);
  });
}

test('accepts a single-line upgrade in the final stage', () => {
  assert.ok(hasAlpineUpgrade(publishedStage('FROM alpine\nRUN apk upgrade --no-cache # Apply security updates')));
});

test('accepts an upgrade split across lines with an interleaved Dockerfile comment', () => {
  const dockerfile = String.raw`FROM alpine
RUN apk upgrade \
    # Fetch updates without saving the index
    --no-cache && \
    apk add --no-cache curl`;
  assert.ok(hasAlpineUpgrade(publishedStage(dockerfile)));
});

test('accepts the Dockerfile escape directive for line continuations', () => {
  const dockerfile = [
    '\uFEFF# syntax=docker/dockerfile:1',
    '# escape=`',
    'FROM alpine',
    'RUN apk upgrade `',
    '    --no-cache',
  ].join('\n');
  assert.ok(hasAlpineUpgrade(publishedStage(dockerfile)));
});

test('accepts a final-stage upgrade with Dockerfile options and stage aliases', () => {
  const dockerfile = [
    'FROM --platform=$TARGETPLATFORM alpine AS Base',
    'from Base as production',
    'run --network=default apk upgrade --no-cache',
  ].join('\r\n');
  const stage = publishedStage(dockerfile);
  assert.ok(isAlpineBase(stage.baseImage));
  assert.ok(hasAlpineUpgrade(stage));
});

test('only the published stage determines whether the Alpine policy applies', () => {
  const dockerfile = 'FROM node:26-alpine AS builder\nFROM debian:stable-slim AS production';
  assert.equal(isAlpineBase(publishedStage(dockerfile).baseImage), false);
  assert.equal(isAlpineBase(publishedStage(dockerfile, 'builder').baseImage), true);
});

for (const base of ['${IMG}', '$IMG']) {
  test(`rejects an unresolved base image ${base} in the published stage`, () => {
    const dockerfile = `ARG IMG=node:26-alpine\nFROM ${base} AS base\nFROM base AS production`;
    assert.throws(
      () => assertPublishedAlpineUpgrade(dockerfile, 'example/Dockerfile'),
      /example\/Dockerfile: cannot determine whether published base image .* uses Alpine/,
    );
  });
}

test('rejects an unterminated heredoc even after a stage with an upgrade', () => {
  const dockerfile = 'FROM alpine\nRUN apk upgrade --no-cache\nCOPY <<EOF /file\ntext';
  assert.throws(
    () => assertPublishedAlpineUpgrade(dockerfile, 'example/Dockerfile'),
    /example\/Dockerfile: cannot find published stage/,
  );
});

test('keeps the legacy multiline upgrade together as a single command', () => {
  const dockerfile = String.raw`FROM alpine
RUN apk update && \
apk upgrade && \
apk add --no-cache curl`;
  const stage = publishedStage(dockerfile);
  assert.deepEqual(stage.runCommands, [
    'apk update && apk upgrade && apk add --no-cache curl',
  ]);
  assert.equal(hasAlpineUpgrade(stage), false);
});

test('finds the final-stage upgrade after a heredoc contains a fake stage', () => {
  const dockerfile = [
    'FROM alpine',
    'COPY <<"NOTE\\$" /note',
    'FROM scratch',
    'NOTE$',
    'RUN apk upgrade --no-cache',
  ].join('\n');
  const stage = publishedStage(dockerfile);
  assert.equal(stage.baseImage, 'alpine');
  assert.deepEqual(stage.runCommands, ['apk upgrade --no-cache']);
});

const missingUpgrades = [
  ['upgrade in an earlier stage', [
    'FROM alpine AS builder',
    'RUN apk upgrade --no-cache',
    'FROM alpine AS production',
    'COPY --from=builder /app /app',
  ]],
  ['upgrade only in a parent stage', [
    'FROM alpine AS base',
    'RUN apk upgrade --no-cache',
    'FROM base AS production',
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
    assert.equal(hasAlpineUpgrade(publishedStage(lines.join('\n'))), false);
  });
}
