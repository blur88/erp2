import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const CONTROL_FILE = 'test/__tests__/createTestStore.test.tsx'
// The configureStore check exempts this file because its own source names both
// scanned strings.
const GUARD_FILE = 'test/__tests__/testStoreUsage.test.ts'

function relativePath(file: string): string {
  return path.relative(SRC, file).split(path.sep).join('/')
}

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return testFiles(full)
    return /\.test\.tsx?$/.test(entry.name) ? [full] : []
  })
}

describe('test stores around RTK Query', () => {
  const files = testFiles(SRC)

  it('finds the test files at all', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  // #1364. A test file that builds its own store around an RTK Query middleware
  // gets Redux Toolkit's animation-frame batching and owns no cleanup. This
  // configureStore check sees only `configureStore(` and `.middleware` in one
  // test file; it cannot see a store built some other way.
  it('are created with createTestStore, not with configureStore in the test file', () => {
    const offenders = files
      .filter((file) => {
        const relative = relativePath(file)
        if (relative === GUARD_FILE) return false
        const text = readFileSync(file, 'utf8')
        if (relative === CONTROL_FILE) {
          // Exactly one raw store is the intentional default-batched control.
          // A second store in any other helper test must still fail the guard.
          return (text.match(/configureStore\(/g)?.length ?? 0) !== 1
        }
        return text.includes('configureStore(') && text.includes('.middleware')
      })
      .map(relativePath)

    expect(offenders, 'use createTestStore from @/test/createTestStore').toEqual([])
  })
})
