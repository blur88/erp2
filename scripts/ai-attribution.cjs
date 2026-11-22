'use strict';

// Detect AI attribution in commit messages and PR bodies (#2017). The policy
// and its accepted and rejected forms are in docs/agents/commit-attribution.md.

const maxReportedText = 100;
const missingBodyMessage = 'The PR body is missing or inaccessible (GitHub reports an empty description as missing), so it cannot be checked for AI attribution.';

// A trailer key that credits a contributor, so its value decides the verdict.
const creditKey = /^(?:co[-_ ]?(?:authored|developed)|authored|assisted|generated|created|written|signed[-_ ]off|reviewed|suggested|helped)[-_ ]?by$/i;
const sessionKey = /^claude[-_ ]?session(?:[-_ ]?id)?$/i;

// A name is an AI tool only when every word is a tool or a qualifier ("Claude Opus 4.1", "OpenAI Codex"),
// so "Claude Dupont", "Codex Jones" and "Sam Openai-Smith" stay people. Ambiguous first names need a qualifier.
const sure = 'chatgpt|openai|anthropic|copilot|codex|claude|gemini|gpt|windsurf|codeium|tabnine|deepseek|aider';
const ambiguous = 'devin|cursor|github|amazon q';
const qualifier = 'code|opus|sonnet|haiku|fable|ai|bot|agent|assistant|developer|cli|pro|flash|ultra|chat|mini|turbo|integration|v?\\d[\\w.]*';
const aiName = new RegExp(`^(?:(?:${sure})(?:[\\s-]+(?:${sure}|${ambiguous}|${qualifier}))*|(?:${ambiguous})(?:[\\s-]+(?:${sure}|${ambiguous}|${qualifier}))+)$`, 'i');
const bareAiName = /^(?:ai|llm|assistant)$/i;
// A vendor domain alone is not enough: employees are people. Only a tool-style mailbox counts.
const aiToolMailbox = /(?:^|[<\s])(?:\d+\+)?(?:no-?reply|claude|chatgpt|codex|copilot|bot|ai|assistant)[\w.+-]*@(?:[\w-]+\.)*(?:anthropic\.com|openai\.com|claude\.ai|cursor\.com|codeium\.com|windsurf\.com|aider\.chat|devin\.ai|cognition\.ai|x\.ai|deepseek\.com)(?=[>\s]|$)/i;
const aiBotEmail = /\b(?:copilot|claude|codex|chatgpt-codex-connector|devin-ai-integration|cursor|gemini-code-assist)(?:\[bot\])?@users\.noreply\.github\.com\b/i;

const sessionUrl = new RegExp(
  'https?://(?:www\\.)?(?:' + [
    'claude\\.ai/(?:code/session_|chat/|share/)', 'chatgpt\\.com/(?:c|share)/',
    'chat\\.openai\\.com/(?:c|share)/', 'gemini\\.google\\.com/(?:app|share)/', 'g\\.co/gemini/share/',
  ].join('|') + ')[^\\s)>\\]]+', 'i');

const aiTool = '(?:claude|chatgpt|gpt-?\\d\\S*|openai|anthropic|(?:github )?copilot|codex|gemini|cursor|aider|windsurf|codeium|devin|ai|an? (?:ai|llm))';
// The tool name must end the line apart from markdown, a link, a version or a word such as "Code",
// so "Built with OpenAI SDK support" stays ordinary prose.
const attributionProse = new RegExp(
  `^(?:generated|created|authored|written|made|built|assisted|produced|co-?authored)\\s+(?:with|by|using|via)\\s+(?:the\\s+)?[\\[*_\`]*${aiTool}`
  + '(?:\\s*(?:code|codex|chat|assistance|assistant|agent|ai|v?\\d[\\w.]*|\\[[^\\]]*\\]|\\([^)]*\\)|[\\]*_`.!,]|\\p{Extended_Pictographic}|\\uFE0F))*\\s*$', 'iu');

const invisible = /[\u200B-\u200D\u2060\uFEFF]/g;
const leadingNoise = /^(?:[\s>*_#\-\p{Extended_Pictographic}\uFE0F\u200D]|<!--)+/u;
const scissors = /^# -{24} >8 -{24}$/;

function isAiIdentity(value) {
  const name = value.split('<', 1)[0].replace(/["'`*_[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  return aiToolMailbox.test(value) || aiBotEmail.test(value) || aiName.test(name) || bareAiName.test(name);
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
 * there is still attribution. Lines starting with # are judged too, because
 * git commit -m keeps them. With scissors, everything below git's scissors
 * line (the diff shown by git commit -v) is skipped.
 */
function findAttribution(text, { scissors: stopAtScissors = false } = {}) {
  const violations = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (const [index, raw] of lines.entries()) {
    if (stopAtScissors && scissors.test(raw)) break;
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

function formatViolation({ line, reason, text }) {
  return `line ${line}: ${reason}: "${text}"`;
}

/**
 * Check the PR body and every PR-owned commit. Returns one message per
 * violation, and throws when an input is missing so the check cannot pass on
 * data it never saw.
 */
function attributionFailures({ body, commits }) {
  if (typeof body !== 'string') throw new Error(missingBodyMessage);
  if (!Array.isArray(commits) || commits.length === 0) {
    throw new Error('The PR commit list is missing or empty, so it cannot be checked for AI attribution.');
  }
  const failures = [];
  const collect = (label, text) => {
    for (const violation of findAttribution(text)) failures.push(`${label} ${formatViolation(violation)}`);
  };
  collect('PR body', body);
  for (const commit of commits) {
    if (typeof commit?.hash !== 'string' || typeof commit?.message !== 'string') {
      throw new Error('The PR commit list contains a malformed commit without a hash and message.');
    }
    collect(`commit ${commit.hash.slice(0, 12)}`, commit.message);
  }
  return failures;
}

module.exports = { findAttribution, attributionFailures, formatViolation, missingBodyMessage };
