const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('yaml');

test('the release job installs locked dependencies once before validation and publishing', () => {
  const workflowPath = path.resolve(__dirname, '../../.github/workflows/release.yml');
  const workflow = parse(fs.readFileSync(workflowPath, 'utf8'));
  const commands = workflow.jobs.release.steps.map(step => step.run?.trim()).filter(Boolean);
  const installCommands = commands.filter(command => /\bnpm\s+(?:ci|install|i|add)\b/.test(command));

  assert.deepEqual(installCommands, ['npm ci']);
  const validation = commands.indexOf('npm run test:release');
  const publishing = commands.indexOf('bash scripts/run-semantic-release.sh');
  assert.ok(commands.indexOf('npm ci') < validation, 'npm ci must precede release validation');
  assert.ok(validation < publishing, 'release validation must precede publishing');
});
