#!/usr/bin/env node
// Assembles <scratch>/results.json from what the run left behind, and prints
// the summary. It never decides the exit status: run.sh owns that, and passes
// it in so the file and the status cannot disagree.
//
// Inputs, all in the scratch directory (a missing one is recorded as missing,
// not skipped silently):
//   results-cases.json     cases 1 to 15 and W1                  (cases.mjs)
//   results-latency.json   M1 to M5                              (measure.mjs)
//   stack-before.recorded.json / stack-during.json / stack-after.json
//                          `stack.sh show` before, during and after the run
//   docker-ps-before-latency.txt
//                          the host's containers just before the measurement
//                          (run.sh); recorded with M3 and M4 as the competing
//                          workload
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { competingWorkload, summaryLines } from './lib/latency-criteria.mjs'
import { W1_SCOPE, observedLine } from './lib/w1-judgement.mjs'

const scratch = process.env.QA_SCRATCH || process.cwd()
const read = (name) => {
  const path = join(scratch, name)
  if (!existsSync(path)) return { missing: `${name} was not written` }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    return { missing: `${name} is not valid JSON: ${err.message}` }
  }
}

const cases = read('results-cases.json')
const latency = read('results-latency.json')
const status = Number(process.env.QA_RUN_STATUS ?? 1)

// The competing workload belongs with the diagnostic figures it explains. A
// list that was not captured is recorded as not captured, never as "none".
const psPath = join(scratch, 'docker-ps-before-latency.txt')
const workload = competingWorkload(existsSync(psPath) ? readFileSync(psPath, 'utf8') : null)
if (!latency.missing) latency.environment = { ...(latency.environment ?? {}), competingWorkload: workload }
const restoreFailed = process.env.QA_RESTORE_FAILED === '1'
// Whether run.sh reached its last line, and if not, why (lib/run-guard.sh).
// A run that did not complete never has exit status 0.
const completed = process.env.QA_RUN_COMPLETED === '1'
const aborted = process.env.QA_RUN_ABORTED || null

const results = {
  suite: 'cross-tab-session (#1345)',
  writtenAt: new Date().toISOString(),
  commit: process.env.QA_COMMIT || cases.commit || null,
  exitStatus: status,
  completed,
  aborted: completed ? null : aborted ?? 'the run did not reach its last line',
  stackRestored: !restoreFailed,
  restoreFailure: restoreFailed
    ? 'stack.sh restore failed: the stack may still run the QA configuration. See the capture file and the command stack.sh printed.'
    : null,
  configuration: {
    note: 'What `stack.sh show` reported from inside the running backend. Evidence in its own right: .env is not covered by the commit.',
    before: read('stack-before.recorded.json'),
    during: read('stack-during.json'),
    after: read('stack-after.json'),
  },
  chromium: cases.chromium ?? latency.chromium ?? null,
  machine: cases.machine ?? latency.machine ?? null,
  servedBuild: cases.servedBuild ?? null,
  servedFrom: cases.servedFrom ?? null,
  partial: cases.partial ?? null,
  signInWaits: cases.signInWaits ?? null,
  loginZone429: cases.loginZone429 ?? null,
  limits: cases.limits ?? null,
  cases: cases.cases ?? cases,
  w1: cases.w1 ?? null,
  latency,
}
writeFileSync(join(scratch, 'results.json'), JSON.stringify(results, null, 2))

console.log('\n=== cross-tab session run ===')
console.log(`commit ${results.commit}   exit status ${status}   stack restored: ${results.stackRestored ? 'yes' : 'NO'}`)
if (!completed) console.log(`  RUN NOT COMPLETED: ${results.aborted}. What follows is what was written before it stopped.`)
// Said here as well as in the cases file: the summary is what a reader sees
// first, and a partial run must never be mistaken for recorded evidence.
if (results.partial) console.log(`  NOT A RECORDED RUN: ${results.partial}`)
for (const key of ['before', 'during', 'after']) {
  const c = results.configuration[key]
  console.log(`  ${key.padEnd(6)} ${c.missing ?? `access ${c.accessTokenExpiry}, grace ${c.refreshGraceSeconds}, build ${c.servedBuild || '(none)'}`}`)
}
if (Array.isArray(results.cases)) {
  for (const c of results.cases) console.log(`  case ${String(c.id).padStart(2)} ${c.pass ? 'pass' : 'FAIL'}  ${c.name}`)
  const passed = results.cases.filter((c) => c.pass).length
  console.log(`  ${passed} of ${results.cases.length} cases passed${results.partial ? ` (PARTIAL: ${results.partial})` : ''}`)
} else {
  console.log(`  cases: ${cases.missing}`)
}
if (results.w1) {
  const user = results.w1.recorded?.user
  console.log(`  W1 ${results.w1.pass ? 'pass' : 'FAIL'}  as a non-administrator (role ${user?.role ?? '?'}, ${user?.pagesTheRoleCanOpen?.length ?? '?'} pages)`)
  // What was observed at each size, all three rounds: no capacity is stated.
  for (const o of results.w1.recorded?.judgement?.observed ?? []) console.log(`     ${observedLine(o)}`)
  // A tab is usable only with its data present, the shell's included, and an
  // action working; what rounds (a) and (b) needed is printed, not only the
  // verdict.
  for (const r of results.w1.recorded?.rounds ?? []) {
    if (r.round === 'c') continue
    const lost = Object.entries(r.dataNotRecoverableByRole ?? {})
    console.log(
      `     N=${r.n} (${r.round}): company data by the application's retry after a 429: ${r.tabsCompanyByAutomaticRetry}` +
        `${r.companyAutomaticRetryWaitMs ? ` (${r.companyAutomaticRetryWaitMs.shortest} to ${r.companyAutomaticRetryWaitMs.longest} ms)` : ''}, retries used up: ${r.tabsCompanyRetryExhausted}; ` +
        `needed manual recovery ${r.tabsNeedingRecovery}; not usable ${r.tabsNotRecoverable?.length ?? '?'}`,
    )
    // By name, on a line of its own: what the role had no way to get back.
    for (const [data, tabs] of lost) console.log(`       NOT recoverable by this role without a reload: ${data}, in ${tabs.length} of ${r.n} tabs`)
  }
  console.log(`     ${W1_SCOPE}`)
  for (const finding of results.w1.recorded?.judgement?.nonBlockingFindings ?? []) console.log(`     (not blocking) ${finding}`)
} else {
  console.log('  W1: not run')
}
if (latency.missing) console.log(`  latency: ${latency.missing}`)
else {
  const failures = [...(latency.blockingFailures ?? []), ...(latency.diagnosticsNotRecorded ?? [])]
  console.log(`  latency ${latency.pass ? 'pass (M1 and M2 only; M3 and M4 are diagnostic and were not judged)' : 'FAIL'}${failures.length ? `: ${failures.join('; ')}` : ''}`)
  for (const line of summaryLines(latency)) console.log(`     ${line}`)
  for (const line of latency.maximaAbove100Ms ?? []) console.log(`     (not blocking) ${line}`)
  const seen = latency.environment?.requestsAnswered429DuringMeasuredLoads
  if (seen) console.log(`     measured loads answered 429: ${seen.oneTab.answered429} of ${seen.oneTab.requests} (one tab), ${seen.fourTabs.answered429} of ${seen.fourTabs.requests} (four tabs)`)
  console.log(`     competing workload: ${workload.note}`)
}
console.log(`  sign-in waits: ${results.signInWaits}   results: ${join(scratch, 'results.json')}`)
