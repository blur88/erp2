import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// #1364. A test file that builds its own store around an RTK Query middleware
// gets Redux Toolkit's animation-frame batching and owns no cleanup. This is a
// text check, so it sees only that shape: `configureStore(` and `.middleware` in
// one test file. It cannot see a store built some other way.

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const CONTROL_FILE = 'test/__tests__/createTestStore.test.tsx'
// This guard necessarily names both scanned strings.
const GUARD_FILE = 'test/__tests__/testStoreUsage.test.ts'

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

  it('do not load the application store at runtime', () => {
    // Text guard: static value imports (including mixed type/value imports),
    // dynamic imports, and vi.mock factories using importOriginal/vi.importActual.
    // String/Promise mock forms, arrow/function factories and spy options are seen.
    // Alias and relative store/index paths are resolved below. Type-only imports
    // and fully stubbed mock factories are allowed. It does not follow transitive
    // imports: a component importing persistor can still load the app store.
    const offenders = files.filter((file) => {
      if (path.relative(SRC, file).split(path.sep).join('/') === GUARD_FILE) return false
      const text = readFileSync(file, 'utf8')
      const isStore = (specifier: string) => {
        const resolved = specifier.startsWith('@/')
          ? path.resolve(SRC, specifier.slice(2))
          : specifier.startsWith('.') ? path.resolve(path.dirname(file), specifier) : ''
        return [path.join(SRC, 'store'), path.join(SRC, 'store/index'), path.join(SRC, 'store/index.ts')].includes(resolved)
      }
      // Capture a complete mock call, balancing parentheses so nested calls and
      // multiline factories do not truncate the factory at its first return.
      let stubbed = false
      for (const match of text.matchAll(/vi\.mock\(\s*(?:import\s*\(\s*)?(['"])([^'"]+)\1\s*\)?\s*,/g)) {
        if (!isStore(match[2])) continue
        const start = match.index + match[0].length
        let depth = 1
        let end = start
        const tokens = /(['"`])(?:\\.|(?!\1)[^\\])*?\1|\/\*[\s\S]*?\*\/|\/\/[^\n]*|[()]/g
        tokens.lastIndex = start
        for (let token = tokens.exec(text); token; token = tokens.exec(text)) {
          if (token[0] === '(') depth++
          if (token[0] === ')') depth--
          if (depth === 0) { end = token.index; break }
        }
        const factory = text.slice(start, end)
        // The injected original-loader may have any parameter name.
        const loader = factory.match(/^\s*(?:async\s*)?(?:\(\s*([\w$]+)\s*\)|([\w$]+))\s*=>/)
          ?? factory.match(/^\s*(?:async\s*)?function\s*\w*\s*\(\s*([\w$]+)/)
        const loaderName = loader?.[1] ?? loader?.[2]
        if (loaderName && new RegExp(`\\b${loaderName}\\s*(?:<[^;]*?>)?\\s*\\(`).test(factory)) return true
        const isFactory = /^\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>|^\s*(?:async\s*)?function\b/.test(factory)
        if (!isFactory) return true // Options such as { spy: true } load the original.
        if (end > start) stubbed = true
      }
      for (const match of text.matchAll(/vi\.importActual\s*(?:<[^;]*?>)?\s*\(\s*(['"])([^'"]+)\1/g)) {
        if (isStore(match[2])) return true
      }
      for (const match of text.matchAll(/\bimport\s+(?!type\b)([^;]*?)\s+from\s*(['"])([^'"]+)\2|\bimport\s*(['"])([^'"]+)\4|\bimport\s*\(\s*(['"])([^'"]+)\6\s*\)/g)) {
        const specifier = match[3] ?? match[5] ?? match[7]
        if (!isStore(specifier)) continue
        if (match[1]?.trim().startsWith('{')) {
          const bindings = match[1].trim().slice(1, -1).split(',').filter((binding) => binding.trim())
          if (bindings.every((binding) => /^\s*type\s+/.test(binding))) continue
        }
        if (match[7] && /typeof\s*$/.test(text.slice(0, match.index))) continue
        if (!stubbed) return true
      }
      return false
    }).map((file) => path.relative(SRC, file).split(path.sep).join('/'))

    expect(offenders, 'use createTestStore or a fully stubbed app-store mock').toEqual([])
  })

  it('are created with createTestStore, not with configureStore in the test file', () => {
    const offenders = files
      .filter((file) => {
        const relative = path.relative(SRC, file).split(path.sep).join('/')
        if (relative === GUARD_FILE) return false
        const text = readFileSync(file, 'utf8')
        if (relative === CONTROL_FILE) {
          // Exactly one raw store is the intentional default-batched control.
          // A second store in any other helper test must still fail the guard.
          return (text.match(/configureStore\(/g)?.length ?? 0) !== 1
        }
        return text.includes('configureStore(') && text.includes('.middleware')
      })
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'))

    expect(offenders, 'use createTestStore from @/test/createTestStore').toEqual([])
  })
})
