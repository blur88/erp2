const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('development reference delegates merging to the guarded merge convention', () => {
  const text = fs.readFileSync(path.resolve(__dirname, '../../docs/agents/development-reference.md'), 'utf8');
  assert.doesNotMatch(text, /\bgh\s+pr\s+merge\b/, 'direct merge examples bypass the review gate');
  assert.match(text, /\[guarded merge[^\]]*\]\(code-review\.md#merge-gate\)/);
});
