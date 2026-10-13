#!/usr/bin/env node
// Runs one test of one file by itself and fails unless exactly that one test
// ran and passed (#1387).
//
// Vitest exits 0 when a `-t` pattern matches nothing: every test is reported
// skipped. A step that only ran `vitest -t` would therefore keep passing after
// the test it names was renamed or removed, so the counts are read back from
// the JSON report and checked here.
//
//   node scripts/run-one-test.mjs <test file> <test name pattern>
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [file, pattern] = process.argv.slice(2)
if (!file || !pattern) {
  console.error('usage: node scripts/run-one-test.mjs <test file> <test name pattern>')
  process.exit(2)
}

const dir = mkdtempSync(join(tmpdir(), 'run-one-test-'))
const report = join(dir, 'report.json')
let status = 1
try {
  const run = spawnSync(
    'npx',
    ['vitest', '--run', file, '-t', pattern, '--reporter=default', '--reporter=json', `--outputFile.json=${report}`],
    { stdio: 'inherit' },
  )
  let counts
  try {
    const { numPassedTests, numFailedTests } = JSON.parse(readFileSync(report, 'utf8'))
    counts = { passed: numPassedTests, failed: numFailedTests }
  } catch {
    console.error(`run-one-test: no report was written for ${file}`)
  }
  if (counts) {
    if (run.status === 0 && counts.passed === 1 && counts.failed === 0) {
      status = 0
    } else {
      console.error(
        `run-one-test: expected exactly 1 test to run and pass in ${file} for /${pattern}/, ` +
          `got ${counts.passed} passed, ${counts.failed} failed, exit ${run.status}`,
      )
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
process.exit(status)
