const { test } = require('node:test');
const assert = require('node:assert/strict');
const { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('maintenance radar displays relative paths from a checkout with brackets', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'maintain-[checkout]-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const script = path.join(dir, 'maintain.sh');
  copyFileSync(path.resolve(__dirname, '../../maintain.sh'), script);

  const pages = path.join(dir, 'frontend/src/pages');
  mkdirSync(pages, { recursive: true });
  writeFileSync(path.join(pages, 'example.tsx'), [
    'const [dateFrom] = useState();',
    'const [dateTo] = useState();',
    'const [loading] = useState();',
  ].join('\n'));

  const result = spawnSync('bash', [script], {
    input: '7\nq\n',
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  assert.match(result.stdout, /⚠  pages\/example\.tsx/);
});
