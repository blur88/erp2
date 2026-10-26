import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const CONTROL_FILE = 'test/__tests__/createTestStore.test.tsx'
// The configureStore check exempts this file because its own source names both
// scanned strings. The runtime-store check scans this file as well.
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

  it('do not load the application store at runtime', () => {
    // #1479 text guard: static value imports (including mixed type/value imports),
    // dynamic imports, vi.mock/vi.doMock factories using their original-loader,
    // and vi.importActual/vi.importMock calls. String/Promise mock forms,
    // arrow/function factories (including typed parameters) and spy options are seen.
    // Alias and relative store/index paths (.ts or .js) are resolved below.
    // Type-only imports are allowed. Only fully stubbed vi.mock factories exempt
    // value or dynamic imports; a stubbed doMock factory is not itself an offender
    // but exempts no import.
    // Accepted residuals: a commented-out vi.mock stub can suppress a finding;
    // template-literal specifiers and transitive imports are not followed (a
    // component importing persistor can still load the app store).
    const storePaths = ['store', 'store/index', 'store/index.ts', 'store/index.js'].map((suffix) => path.join(SRC, suffix))
    const offenders = files.filter((file) => {
      const text = readFileSync(file, 'utf8')
      const isStore = (specifier: string) => {
        const resolved = specifier.startsWith('@/')
          ? path.resolve(SRC, specifier.slice(2))
          : specifier.startsWith('.') ? path.resolve(path.dirname(file), specifier) : ''
        return storePaths.includes(resolved)
      }
      // Capture a complete mock call, balancing parentheses so nested calls and
      // multiline factories do not truncate the factory at its first return.
      let stubbed = false
      for (const match of text.matchAll(/vi\.(?<method>mock|doMock)\(\s*(?:import\s*\(\s*)?(?<quote>['"])(?<specifier>[^'"]+)\k<quote>\s*\)?\s*,/g)) {
        if (!isStore(match.groups.specifier)) continue
        const start = match.index + match[0].length
        let depth = 1
        let end = start
        const tokens = /(?<quote>['"`])(?:\\.|(?!\k<quote>)[^\\])*?\k<quote>|\/\*[\s\S]*?\*\/|\/\/[^\n]*|[()]/g
        tokens.lastIndex = start
        for (let token = tokens.exec(text); token; token = tokens.exec(text)) {
          if (token[0] === '(') depth++
          if (token[0] === ')') depth--
          if (depth === 0) { end = token.index; break }
        }
        const factory = text.slice(start, end)
        // Capture the first identifier parameter; any type annotation after it is ignored.
        const loader = factory.match(/^\s*(?:async\s*)?(?:\(\s*(?<parenthesized>[\w$]+)|(?<bare>[\w$]+)\s*=>)/)
          ?? factory.match(/^\s*(?:async\s*)?function\s*\w*\s*\(\s*(?<parenthesized>[\w$]+)/)
        const loaderName = loader?.groups?.parenthesized ?? loader?.groups?.bare
        if (loaderName && new RegExp(`(?<![\\w$])${loaderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:<[^;]*?>)?\\s*\\(`).test(factory)) return true
        const isFactory = /^\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>|^\s*(?:async\s*)?function\b/.test(factory)
        if (!isFactory) return true // Options such as { spy: true } load the original.
        if (end > start) {
          if (match.groups.method === 'mock') stubbed = true
        }
      }
      for (const match of text.matchAll(/vi\.(?:importActual|importMock)\s*(?:<[^;]*?>)?\s*\(\s*(?<quote>['"])(?<specifier>[^'"]+)\k<quote>/g)) {
        if (isStore(match.groups.specifier)) return true
      }
      for (const match of text.matchAll(/\bimport\s+(?!type\b)(?<bindings>[^;]*?)\s+from\s*(?<fromQuote>['"])(?<fromPath>[^'"]+)\k<fromQuote>|\bimport\s*(?<sideEffectQuote>['"])(?<sideEffectPath>[^'"]+)\k<sideEffectQuote>|\bimport\s*\(\s*(?<dynamicQuote>['"])(?<dynamicPath>[^'"]+)\k<dynamicQuote>\s*\)/g)) {
        const { bindings: importedBindings, fromPath, sideEffectPath, dynamicPath } = match.groups
        const specifier = fromPath ?? sideEffectPath ?? dynamicPath
        if (!isStore(specifier)) continue
        if (importedBindings?.trim().startsWith('{')) {
          const bindings = importedBindings.trim().slice(1, -1).split(',').filter((binding) => binding.trim())
          if (bindings.every((binding) => /^\s*type\s+/.test(binding))) continue
        }
        if (dynamicPath && /typeof\s*$/.test(text.slice(0, match.index))) continue
        if (!stubbed) return true
      }
      return false
    }).map(relativePath)

    expect(offenders, 'use createTestStore or a fully stubbed app-store mock').toEqual([])
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
