// Structured evidence inside the immutable reviewer report; the ledger remains the index.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function reviewState({ key, row, report, previous, fail, reconciled, snapshotRound }) {
  const match = report.match(/```review-state\n([\s\S]*?)\n```/);
  if (!match) { fail('missing review-state evidence'); return; }
  let data;
  try { data = JSON.parse(match[1]); } catch { fail('invalid review-state JSON'); return; }
  const nonempty = value => typeof value === 'string' && value.trim().length > 0;
  const artifact = name => nonempty(name) && existsSync(resolve(key, name));
  const full = data.scope === 'full PR';
  if (reconciled) data.scope = 'inherited';
  if (!['full PR', 'delta', 'inherited'].includes(data.scope)) fail('invalid coverage scope');
  if (!nonempty(data.implementer) || !Array.isArray(data.reviewers) || !data.reviewers.length || data.reviewers.some(r => !nonempty(r.session) || r.session === data.implementer || !artifact(r.report))) fail('independent reviewer identities and saved reports required');
  if (!Array.isArray(data.requiredCriteria) || !data.requiredCriteria.length || new Set(data.requiredCriteria).size !== data.requiredCriteria.length || data.requiredCriteria.some(id => !nonempty(id))) fail('required criterion inventory missing or duplicated');
  const criteria = Array.isArray(data.criteria) ? data.criteria : [];
  if (new Set(criteria.map(c => c.id)).size !== criteria.length) fail('duplicate criterion');
  const required = full ? data.requiredCriteria ?? [] : [...(data.touchedCriteria ?? []), ...(previous?.criteria ?? []).filter(c => c.status === 'unmet').map(c => c.id)];
  for (const id of required) if (!criteria.some(c => c.id === id)) fail(`criterion missing: ${id}`);
  if (previous?.requiredCriteria && JSON.stringify(data.requiredCriteria) !== JSON.stringify(previous.requiredCriteria)) fail('criterion inventory changed without scope reset');
  for (const c of criteria) {
    if (!(data.requiredCriteria ?? []).includes(c.id) || !['met', 'unmet'].includes(c.status)) { fail('invalid criterion'); continue; }
    if (c.status === 'unmet') { if (!nonempty(c.reason)) fail(`unmet criterion needs reason: ${c.id}`); continue; }
    try {
      if (!Number.isInteger(c.line) || c.line < 1 || !nonempty(c.quote)) throw Error();
      const revision = row.kind === 'working-tree' ? JSON.parse(readFileSync(resolve(key, `review-round-${String(snapshotRound ?? row.round).padStart(2, '0')}.snapshot.json`))).tree : row['reviewed head'];
      const source = execFileSync('git', ['show', `${revision}:${c.file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (!source.split('\n').slice(c.line - 1, c.line - 1 + c.quote.split('\n').length).join('\n').includes(c.quote)) throw Error();
    } catch { fail(`criterion evidence unverifiable: ${c.id}`); }
  }
  const findings = Array.isArray(data.findings) ? data.findings : [];
  if (!Array.isArray(data.findings) || new Set(findings.map(f => f.id)).size !== findings.length) fail('findings missing or duplicated');
  for (const old of previous?.findings ?? []) {
    const current = findings.find(f => f.id === old.id);
    if (!current) fail(`earlier finding missing: ${old.id}`);
    else if (current.severity !== old.severity || current.blocking !== old.blocking) fail(`finding severity changed: ${old.id}`);
  }
  for (const f of findings) {
    if (!nonempty(f.id) || !nonempty(f.severity) || typeof f.blocking !== 'boolean' || !['open', 'resolved', 'declined'].includes(f.status)) fail('invalid finding disposition');
    if (f.status === 'resolved' && (!/.:\d+$/.test(f.location ?? '') || !artifact(f.evidence))) fail(`resolved finding needs location/evidence: ${f.id}`);
    if (f.status === 'declined' && (!artifact(f.authorization) || !nonempty(f.decisionMaker) || !nonempty(f.justification))) fail(`declined finding needs owner authorization: ${f.id}`);
  }
  if (/no remaining findings/i.test(report) && findings.some(f => f.status === 'open')) fail('no remaining findings contradicts open rows');
  const blockers = findings.filter(f => f.status === 'open' && f.blocking).length;
  if ((/^(?:none|0)$/.test(row['blocking findings']) ? 0 : Number(row['blocking findings'])) !== blockers) fail('blocking finding count differs');
  if (typeof data.evidenceComplete !== 'boolean') fail('evidence completeness required');
  if (!Array.isArray(data.checks)) fail('required checks inventory missing');
  for (const c of data.checks ?? []) if (!nonempty(c.command) || !['passed (local)', 'passed (CI)', 'failed', 'pending', 'cancelled', 'not run'].includes(c.status) || !artifact(c.evidence)) fail('check evidence missing');
  const successfulLog = file => {
    const log = readFileSync(resolve(key, file), 'utf8');
    const footer = log.includes('--- end output ---') ? log.slice(log.lastIndexOf('--- end output ---') + 18) : log;
    return !/^\s*not ok\b/m.test(log) && /(?:^|\n)EXIT=0\s*$/.test(footer);
  };
  const checksPassed = (data.checks ?? []).length > 0 && data.checks.every(c => /^passed \((local|CI)\)$/.test(c.status) && artifact(c.evidence) && successfulLog(c.evidence));
  const completion = /^complete\b/.test(row.outcome) && data.evidenceComplete ? 'complete' : row.outcome === 'aborted' ? 'aborted' : 'partial';
  if (/^complete\b/.test(row.outcome) && !data.evidenceComplete) fail('complete review lacks required evidence');
  const clean = !blockers && !criteria.some(c => c.status === 'unmet');
  return { ...data, completion, coverage: { scope: reconciled ? 'inherited' : data.scope, complete: completion === 'complete' }, reuseEligible: completion === 'complete' && full && !reconciled && row.kind === 'committed' && clean && checksPassed, mergeEligible: completion === 'complete' && full && row.kind === 'pre-merge' && clean && checksPassed };
}
