const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

test('the reverse-proxy Dockerfile upgrades Alpine packages during the image build', () => {
  const dockerfile = readFileSync(resolve(__dirname, '../../nginx/Dockerfile'), 'utf8');
  assert.match(dockerfile, /^RUN\s+(?:apk update\s+&&\s+)?apk upgrade\b/m);
});
