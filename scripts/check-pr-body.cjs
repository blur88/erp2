const { readFileSync } = require('node:fs');

function invalidClosingLines(body) {
  return body.split(/\r?\n/).flatMap((line, index) => {
    const hasClosingReference = /\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\s+#\d+\b/i.test(line);
    const isCanonical = /^(?:Closes|Fixes|Resolves) #\d+$/.test(line);
    return hasClosingReference && !isCanonical ? [index + 1] : [];
  });
}

if (require.main === module) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const lines = invalidClosingLines(event.pull_request.body ?? '');
  if (lines.length) {
    console.error(`Invalid closing reference on line(s) ${lines.join(', ')}. Use \`Refs #<n>\` for issues this PR must not close.`);
    process.exitCode = 1;
  }
}

module.exports = { invalidClosingLines };
