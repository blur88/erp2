const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('yaml');

function readYaml(relativePath) {
  return parse(fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf8'));
}

function normalizeImage(image) {
  return image.replace(/^(?:docker\.io|index\.docker\.io)\//, '');
}

test('every production application image has a tag published with SBOM and max SLSA v0.2 provenance', () => {
  const compose = readYaml('docker-compose.prod.yml');
  const workflow = readYaml('.github/workflows/release.yml');
  const publishedTags = new Set();

  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps ?? []) {
      if (!step.uses?.startsWith('docker/build-push-action@')) continue;
      assert.equal(typeof step.with?.push, 'boolean', `${step.name}: push must be a literal boolean for tag validation`);
      if (step.with.push) {
        // version=v0.2: BuildKit >= v0.28.0 defaults to SLSA v1, which Docker Scout
        // may not read for base-image detection (docs/deployment/DOCKER_SCOUT_BASE_IMAGE_RECOMMENDATIONS.md).
        assert.equal(step.with.provenance, 'mode=max,version=v0.2', `${step.name}: published images must include max SLSA v0.2 provenance`);
        assert.equal(step.with.sbom, true, `${step.name}: published images must include an SBOM`);
        for (const tag of (step.with.tags ?? '').trim().split(/\r?\n/)) {
          publishedTags.add(normalizeImage(tag.trim()));
        }
      }
    }
  }

  const applicationImages = Object.entries(compose.services)
    .filter(([, service]) => service.image && normalizeImage(service.image).startsWith('blur88/'));
  assert.ok(applicationImages.length > 0, 'expected production blur88/* images');

  for (const [service, { image }] of applicationImages) {
    assert.ok(publishedTags.has(normalizeImage(image)), `${service}: ${image} is not published by release.yml`);
  }
});

test('the private Master repository receives only versioned release tags', () => {
  const workflow = readYaml('.github/workflows/release.yml');
  const masterTags = [];

  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps ?? []) {
      if (!step.uses?.startsWith('docker/build-push-action@') || !step.with?.push) continue;
      for (const tag of (step.with.tags ?? '').trim().split(/\r?\n/).map((t) => normalizeImage(t.trim()))) {
        if (tag.startsWith('blur88/master:')) masterTags.push(tag);
      }
    }
  }

  assert.deepEqual(
    masterTags.sort(),
    ['backend', 'frontend', 'nginx']
      .map((image) => `blur88/master:v\${{ needs.release.outputs.new_release_version }}-${image}`)
      .sort(),
    'blur88/master must get exactly one vX.Y.Z-<image> tag per image and no moving tags (ADR 0001)',
  );
});

test('the backend image build receives the semantic-release version and carries it at runtime', () => {
  const workflow = readYaml('.github/workflows/release.yml');
  const buildSteps = Object.values(workflow.jobs)
    .flatMap((job) => job.steps ?? [])
    .filter((step) => step.uses?.startsWith('docker/build-push-action@') && step.with?.context === './backend');

  assert.equal(buildSteps.length, 1, 'release.yml must build the backend image exactly once');
  assert.equal(
    buildSteps[0].with['build-args'],
    'APP_VERSION=${{ needs.release.outputs.new_release_version }}',
    'the backend image build must receive the semantic-release version as APP_VERSION',
  );

  const dockerfile = fs.readFileSync(path.resolve(__dirname, '../../backend/Dockerfile'), 'utf8');
  const finalStage = dockerfile.slice(dockerfile.lastIndexOf('\nFROM ') + 1);
  assert.match(finalStage, /^ARG APP_VERSION$/m, 'the production stage must declare APP_VERSION');
  assert.match(finalStage, /^ENV APP_VERSION=\$APP_VERSION$/m, 'the production stage must carry APP_VERSION at runtime');
});
