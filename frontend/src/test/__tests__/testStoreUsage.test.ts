import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// #1364. A test file that builds its own store around an RTK Query middleware
// gets Redux Toolkit's animation-frame batching and owns no cleanup. This is a
// text check, so it sees only that shape: `configureStore(` and `.middleware` in
// one test file. It cannot see a store built some other way.

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const ALLOWED = new Set([
  // Builds a default-batched store on purpose, as the control for the helper's own test.
  'test/__tests__/createTestStore.test.tsx',
  // This file: it names both strings.
  'test/__tests__/testStoreUsage.test.ts',
])

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

  it('are created with createTestStore, not with configureStore in the test file', () => {
    const offenders = files
      .filter((file) => {
        const text = readFileSync(file, 'utf8')
        return text.includes('configureStore(') && /\.middleware\b/.test(text)
      })
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
      .filter((file) => !ALLOWED.has(file))

    expect(offenders, 'use createTestStore from @/test/createTestStore').toEqual([])
  })
})
