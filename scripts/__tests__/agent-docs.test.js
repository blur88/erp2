// Guards the agent instruction chain behind #2015: Claude Code loads AGENTS.md
// only through an `@AGENTS.md` import in CLAUDE.md, and the review pointer must
// resolve to the canonical evidence section.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const read = (file) => readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
const slug = (heading) => heading.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-');

test('CLAUDE.md imports AGENTS.md instead of only linking it', () => {
  assert.match(read('CLAUDE.md'), /^@AGENTS\.md$/m);
});

test('review pointer in AGENTS.md leads with the trigger and targets an existing section', () => {
  const bullet = read('AGENTS.md')
    .split('\n')
    .find((line) => line.startsWith('- Delegating or running a review, including `/code-review`:'));
  assert.ok(bullet, 'review bullet missing from Workflow Entry Points');
  const anchor = /\(CODING_STANDARDS\.md#([^)]+)\)/.exec(bullet);
  assert.ok(anchor, 'review bullet must link the CODING_STANDARDS.md evidence section');
  const anchors = [...read('CODING_STANDARDS.md').matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1]));
  assert.ok(anchors.includes(anchor[1]), `no heading matches #${anchor[1]}`);
  assert.match(bullet, /every reviewer assignment/);
});

test('reviewer brief requirements live in the evidence section', () => {
  const section = read('CODING_STANDARDS.md').split('## Acceptance-criterion evidence in reviews')[1];
  assert.ok(section, 'evidence section missing');
  for (const required of [/reviewed SHA/, /exact verification commands/, /exit statuses/, /Implemented/, /Demonstrated/, /Unverified/, /once for the reviewed SHA/]) {
    assert.match(section, required);
  }
});

test('CLAUDE.md documents the focused Ingress command; AGENTS.md keeps the full gate', () => {
  const claude = read('CLAUDE.md');
  assert.match(claude, /INGRESS_REQUIRE_DOCKER=1 node --test scripts\/__tests__\/ingress\.test\.js/);
  assert.match(claude, /--test-name-pattern=<name>/);
  assert.match(read('AGENTS.md'), /INGRESS_REQUIRE_DOCKER=1 npm run test:release` and `bash scripts\/lint-workflows\.sh/);
});
