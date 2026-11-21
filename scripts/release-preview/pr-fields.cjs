'use strict';

// Parse and validate the release fields in a PR description (#2002).
const sections = new Map([
  ['Breaking release', ['Breaking change', 'Upgrade documentation']],
  ['Release boundary', [
    'Mergeable independently', 'Must ship together', 'Maintainer decision', 'Applicable ADR', 'Release-impact decision',
  ]],
]);

const sectionExamples = new Map([
  ['Breaking release', '`- Breaking change: no` and `- Upgrade documentation: N/A: No upgrade steps.`'],
  ['Release boundary', '`- Maintainer decision: None`'],
]);

function* visibleLines(body) {
  let fence;
  let comment = false;
  for (const raw of body.split(/\r?\n/)) {
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(raw);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = undefined;
      continue;
    }
    if (!comment && /^(?: {0,3}>| {4}|\t)/.test(raw)) continue;
    const open = !comment && /^ {0,3}(`{3,}(?![`])[^`]*|~{3,}.*)$/.exec(raw);
    if (open) {
      fence = /^[`~]+/.exec(open[1])[0];
      continue;
    }

    let line = '';
    let rest = raw;
    while (rest) {
      const marker = comment ? '-->' : '<!--';
      const index = rest.indexOf(marker);
      if (!comment) line += index === -1 ? rest : rest.slice(0, index);
      if (index === -1) break;
      rest = rest.slice(index + marker.length);
      comment = !comment;
    }
    yield line.trim();
  }
}

function fieldError(field, message) {
  return new Error(`- ${field}: ${message}`);
}

function parse(body) {
  const fields = new Map();
  const seen = new Set();
  let section;
  for (const line of visibleLines(body ?? '')) {
    const heading = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/.exec(line);
    if (heading) {
      section = heading[1] === '##' && sections.has(heading[2]) ? heading[2] : undefined;
      if (section) seen.add(section);
      continue;
    }
    if (!section) continue;
    for (const field of sections.get(section)) {
      const label = new RegExp(`^(?:[-+*]|\\d+[.)])?\\s*(?:\\*\\*)?${field}(?![\\w-])`, 'i');
      if (!label.test(line)) continue;
      const match = new RegExp(`^- (?:${field}:|\\*\\*${field}:\\*\\*|\\*\\*${field}\\*\\* —)(?:[ \\t]+(.*)|$)`).exec(line);
      if (!match) throw fieldError(field, `malformed field. Use \`- ${field}: <value>\`.`);
      if (fields.has(field)) throw fieldError(field, 'duplicate field. Keep one canonical field line.');
      fields.set(field, (match[1] ?? '').trim());
    }
  }
  for (const name of sections.keys()) {
    if (!seen.has(name)) throw new Error(`Missing required section ## ${name}. Add the heading and use canonical field lines such as ${sectionExamples.get(name)}.`);
  }
  return fields;
}

function isPlaceholder(value) {
  return !value || /<[^<>]*>|\bexample\.(?:com|org)\b/i.test(value) ||
    /^(?:TODO|TBD|placeholder|fill in|link|URL|\.\.\.)$/i.test(value);
}

function requireValue(field, value) {
  const reason = /^(?:N\/A|None):\s*(.*)$/.exec(value);
  if (isPlaceholder(value) || (reason && isPlaceholder(reason[1].trim()))) {
    throw fieldError(field, 'provide a value and replace any placeholder or empty reason.');
  }
  return value;
}

function isSafePath(path) {
  return !/[\\:\x00-\x1f\x7f]/.test(path) &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
}

function requireFile(field, path, exists, pattern = /./) {
  if (!isSafePath(path) || !pattern.test(path) || !exists(path)) {
    throw fieldError(field, 'provide a valid repo-relative file path that exists in the merge result.');
  }
}

function validateFields(body, { exists, repository }) {
  const fields = parse(body);
  const value = field => fields.get(field) ?? '';
  const required = field => requireValue(field, value(field));

  const declaration = required('Breaking change');
  if (declaration !== 'yes' && declaration !== 'no') {
    throw fieldError('Breaking change', 'declare exactly yes or no.');
  }
  const breaking = declaration === 'yes';
  const upgrade = required('Upgrade documentation');
  if (breaking || !upgrade.startsWith('N/A:')) {
    requireFile('Upgrade documentation', upgrade, exists);
  }

  const decision = required('Maintainer decision');
  if (decision === 'None' || decision === 'None.') {
    for (const field of ['Applicable ADR', 'Release-impact decision']) {
      if (value(field)) throw fieldError(field, 'leave this field empty when Maintainer decision is None.');
    }
    return breaking;
  }

  const adr = required('Applicable ADR');
  if (breaking || !adr.startsWith('None:')) {
    requireFile('Applicable ADR', adr, exists, /^docs\/adr\/\d{4}-[^/]+\.md$/);
  }
  const impact = required('Release-impact decision');
  const url = /^\[[^\]\n]+\]\(([^()\s]+)\)$/.exec(impact)?.[1] ?? impact;
  const prefix = `https://github.com/${repository}/`;
  const decisionPath = /^(?:issues|pull)\/[1-9]\d*#(?:issuecomment-|pullrequestreview-|discussion_r)[1-9]\d*$/;
  if (!url.startsWith(prefix) || !decisionPath.test(url.slice(prefix.length))) {
    throw fieldError('Release-impact decision', `provide an HTTPS permalink to a comment or review in ${repository}.`);
  }
  return breaking;
}

module.exports = { validateFields };
