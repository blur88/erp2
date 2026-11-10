const fs = require('node:fs');
const path = require('node:path');
function preflightRequest(repo, baseline, kind = 'committed', scope = 'full PR') {
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'CODING_STANDARDS.md']) {
    if (!fs.existsSync(path.join(repo, file))) fs.writeFileSync(path.join(repo, file), 'Fixture review conventions.\n');
  }
  const file = path.join(repo, 'preflight-request.json');
  fs.writeFileSync(file, JSON.stringify({ baseline, kind, scope: scope === 'inherited' ? 'full PR' : scope, harness: process.env.CLAUDE_CODE_SESSION_ID ? 'claude-code' : 'codex', agent: 'fixture-agent' }));
  return file;
}
module.exports = { preflightRequest };
