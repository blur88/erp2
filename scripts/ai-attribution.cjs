'use strict';

// Detect AI attribution in commit messages and PR bodies (#2017). The policy
// and its accepted and rejected forms are in docs/agents/commit-attribution.md.

const maxReportedText = 100;

// A trailer key that credits a contributor, so its value decides the verdict.
const creditKey = /^(?:co[-_ ]?(?:authored|developed)|authored|assisted|generated|created|written|signed[-_ ]off|reviewed|suggested|helped)[-_ ]?by$/i;
const sessionKey = /^claude[-_ ]?session(?:[-_ ]?id)?$/i;

// Names that identify an AI tool on their own, with or without an email.
const aiName = new RegExp(`\\b(?:${[
  'chatgpt', 'openai', 'anthropic', 'copilot', 'codex', 'aider', 'windsurf', 'codeium', 'tabnine', 'deepseek',
  'gpt-?\\d[\\w.-]*', 'claude[- ](?:code|opus|sonnet|haiku|fable|ai|\\d[\\w.-]*)',
  'gemini[- ](?:code|cli|ai|pro|flash|ultra|\\d[\\w.-]*)', 'cursor[- ]?agent', 'devin[- ]ai',
].join('|')})\\b`, 'i');
// A single-word name is an AI tool too. A longer name such as "Claude Dupont" is a person.
const bareAiName = /^(?:claude|gemini|chatgpt|gpt|copilot|codex|ai|llm|assistant)$/i;
const aiEmailDomain = /@(?:[\w-]+\.)*(?:anthropic\.com|openai\.com|claude\.ai|cursor\.com|codeium\.com|windsurf\.com|aider\.chat|devin\.ai|cognition\.ai|x\.ai|deepseek\.com)(?=[>\s]|$)/i;
const copilotEmail = /\bcopilot@users\.noreply\.github\.com\b/i;

const sessionUrl = new RegExp(
  'https?://(?:www\\.)?(?:' + [
    'claude\\.ai/(?:code/session_|chat/|share/)', 'chatgpt\\.com/(?:c|share)/',
    'chat\\.openai\\.com/(?:c|share)/', 'gemini\\.google\\.com/(?:app|share)/', 'g\\.co/gemini/share/',
  ].join('|') + ')[^\\s)>\\]]+', 'i');

const aiTool = '(?:claude|chatgpt|gpt-?\\d\\S*|openai|anthropic|(?:github )?copilot|codex|gemini|cursor|aider|windsurf|codeium|devin|ai|an? (?:ai|llm))';
const attributionProse = new RegExp(
  `^(?:generated|created|authored|written|made|built|assisted|produced|co-?authored)\\s+(?:with|by|using|via)\\b.*\\b${aiTool}\\b`, 'i');

const invisible = /[​-‍⁠﻿]/g;
const leadingNoise = /^(?:[\s>*_#\-\p{Extended_Pictographic}️‍]|<!--)+/u;
const scissors = /^# -{24} >8 -{24}$/;

function isAiIdentity(value) {
  const name = value.replace(/<[^>]*>/g, '').replace(/["'`*_[\]()]/g, '').trim();
  return aiEmailDomain.test(value) || copilotEmail.test(value) || aiName.test(name) || bareAiName.test(name);
}

function classify(raw) {
  const line = raw.replace(invisible, '').replace(leadingNoise, '').trimEnd();
  const trailer = /^([A-Za-z][\w -]*?)\s*:\s*(.*)$/.exec(line);
  if (trailer && sessionKey.test(trailer[1].trim())) return 'Claude-Session line';
  if (trailer && creditKey.test(trailer[1].trim()) && isAiIdentity(trailer[2])) return 'AI co-author trailer';
  if (sessionUrl.test(line)) return 'AI session URL';
  if (attributionProse.test(line)) return 'AI attribution line';
  return null;
}

/**
 * List the lines of a commit message or PR body that carry AI attribution.
 * Code fences, quotes and HTML comments are not exempt: hiding attribution
 * there is still attribution. With gitComments, lines git discards (starting
 * with # and everything below the scissors line) are skipped.
 */
function findAttribution(text, { gitComments = false } = {}) {
  const violations = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (const [index, raw] of lines.entries()) {
    if (gitComments && scissors.test(raw)) break;
    if (gitComments && raw.startsWith('#')) continue;
    const reason = classify(raw);
    if (reason) {
      const shown = raw.trim();
      violations.push({
        line: index + 1,
        reason,
        text: shown.length > maxReportedText ? `${shown.slice(0, maxReportedText - 1)}…` : shown,
      });
    }
  }
  return violations;
}

/**
 * Check the PR body and every PR-owned commit. Returns one message per
 * violation, and throws when an input is missing so the check cannot pass on
 * data it never saw.
 */
function attributionFailures({ body, commits }) {
  if (typeof body !== 'string') throw new Error('The PR body is missing or inaccessible, so it cannot be checked for AI attribution.');
  if (!Array.isArray(commits) || commits.length === 0) {
    throw new Error('The PR commit list is missing or empty, so it cannot be checked for AI attribution.');
  }
  const failures = [];
  const describe = (label, text) => {
    for (const { line, reason, text: shown } of findAttribution(text)) {
      failures.push(`${label} line ${line}: ${reason}: "${shown}"`);
    }
  };
  describe('PR body', body);
  for (const commit of commits) {
    if (typeof commit?.hash !== 'string' || typeof commit?.message !== 'string') {
      throw new Error('The PR commit list contains a malformed commit without a hash and message.');
    }
    describe(`commit ${commit.hash.slice(0, 12)}`, commit.message);
  }
  return failures;
}

module.exports = { findAttribution, attributionFailures };
