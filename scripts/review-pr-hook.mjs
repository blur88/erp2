#!/usr/bin/env node
// Claude Code PreToolUse hook. Conservatively gate commands mentioning gh/pr/create,
// including quoted words, global options, pipelines and compound commands.
import { readFileSync } from 'node:fs';
import { main } from './check-review-ledger.mjs';
try {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  const command = event.tool_input?.command;
  if (typeof command !== 'string') throw Error('missing Bash command');
  const normalized = command.replace(/\\\n/g, '').replace(/["'\\]/g, '');
  if (/\bgh\b/.test(normalized) && /\bpr\b/.test(normalized) && /\bcreate\b/.test(normalized)) main(['gate-create']);
} catch (error) {
  console.error(`PR review gate: ${error.message}; see docs/agents/code-review.md`);
  process.exitCode = 2;
}
