const { test } = require('node:test');
const assert = require('node:assert/strict');
const { invalidClosingLineNumbers } = require('../check-pr-body.cjs');

test('accepts canonical closing lines, references, and empty bodies', () => {
  for (const body of ['', 'Refs #1715', 'Closes #1\r\nFixes #2\r\nResolves #3']) {
    assert.deepEqual(invalidClosingLineNumbers(body), []);
  }
});

test('rejects closing keywords embedded in prose for every GitHub variant', () => {
  for (const keyword of ['close', 'closes', 'closed', 'fix', 'fixes', 'fixed', 'resolve', 'resolves', 'resolved']) {
    assert.deepEqual(invalidClosingLineNumbers(`Summary\ndoes not ${keyword} #1701`), [2]);
    assert.deepEqual(invalidClosingLineNumbers(`${keyword.toUpperCase()} #1701`), [1]);
  }
});

test('requires the whole line to be canonical', () => {
  for (const body of ['- Closes #1', 'Closes #1 and #2', ' Closes #1', 'Closes #1.', 'Closes #1 ']) {
    assert.deepEqual(invalidClosingLineNumbers(body), [1]);
  }
  assert.deepEqual(invalidClosingLineNumbers('prefixes #1\nunresolved #2'), []);
});


test('rejects alternate closing reference syntax', () => {
  for (const reference of ['#5', 'owner/repo#5', 'https://github.com/owner/repo/issues/5']) {
    for (const separator of ['', ' ', ':', ': ']) {
      assert.deepEqual(invalidClosingLineNumbers(`does not close${separator}${reference}`), [1]);
    }
  }
});
