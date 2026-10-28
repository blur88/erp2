import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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
export function appStoreLoads(text: string, file: string): boolean {
  const storePaths = [
    'store',
    'store/index',
    'store/index.ts',
    'store/index.js',
  ].map((suffix) => path.join(SRC, suffix))
  const isStore = (specifier: string) => {
    const resolved = specifier.startsWith('@/')
      ? path.resolve(SRC, specifier.slice(2))
      : specifier.startsWith('.')
        ? path.resolve(path.dirname(file), specifier)
        : ''
    return storePaths.includes(resolved)
  }
  // Capture a complete mock call, balancing parentheses so nested calls
  // do not truncate the factory at its first return.
  let stubbed = false
  for (const match of text.matchAll(
    /vi\.(?<method>mock|doMock)\(\s*(?:import\s*\(\s*)?(?<quote>['"])(?<specifier>[^'"]+)\k<quote>\s*\)?\s*,/g,
  )) {
    if (!isStore(match.groups.specifier)) continue
    const start = match.index + match[0].length
    let depth = 1
    let end = start
    const tokens =
      /(?<quote>['"`])(?:\\.|(?!\k<quote>)[^\\])*?\k<quote>|\/\*[\s\S]*?\*\/|\/\/[^\n]*|[()]/g
    tokens.lastIndex = start
    for (let token = tokens.exec(text); token; token = tokens.exec(text)) {
      if (token[0] === '(') depth++
      if (token[0] === ')') depth--
      if (depth === 0) {
        end = token.index
        break
      }
    }
    const factory = text.slice(start, end)
    // Capture the first identifier parameter; any type annotation after it is ignored.
    const loader =
      factory.match(
        /^\s*(?:async\s*)?(?:\(\s*(?<parenthesized>[\w$]+)|(?<bare>[\w$]+)\s*=>)/,
      ) ??
      factory.match(
        /^\s*(?:async\s*)?function\s*\w*\s*\(\s*(?<parenthesized>[\w$]+)/,
      )
    const loaderName = loader?.groups?.parenthesized ?? loader?.groups?.bare
    if (
      loaderName &&
      new RegExp(
        `(?<![\\w$])${loaderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:<[^;]*?>)?\\s*\\(`,
      ).test(factory)
    )
      return true
    const isFactory =
      /^\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>|^\s*(?:async\s*)?function\b/.test(
        factory,
      )
    if (!isFactory) return true // Options such as { spy: true } load the original.
    if (end > start) {
      if (match.groups.method === 'mock') stubbed = true
    }
  }
  for (const match of text.matchAll(
    /vi\.(?:importActual|importMock)\s*(?:<[^;]*?>)?\s*\(\s*(?<quote>['"])(?<specifier>[^'"]+)\k<quote>/g,
  )) {
    if (isStore(match.groups.specifier)) return true
  }
  for (const match of text.matchAll(
    /\bimport\s+(?!type\b)(?<importClause>[^;'"]*?)\s+from\s*(?<fromQuote>['"])(?<fromPath>[^'"]+)\k<fromQuote>|\bimport\s*(?<sideEffectQuote>['"])(?<sideEffectPath>[^'"]+)\k<sideEffectQuote>|\bimport\s*\(\s*(?<dynamicQuote>['"])(?<dynamicPath>[^'"]+)\k<dynamicQuote>\s*\)/g,
  )) {
    const { importClause, fromPath, sideEffectPath, dynamicPath } = match.groups
    const specifier = fromPath ?? sideEffectPath ?? dynamicPath
    if (!isStore(specifier)) continue
    if (importClause?.trim().startsWith('{')) {
      const bindings = importClause
        .trim()
        .slice(1, -1)
        .split(',')
        .filter((binding) => binding.trim())
      if (bindings.every((binding) => /^\s*type\s+/.test(binding))) continue
    }
    if (dynamicPath && /typeof\s*$/.test(text.slice(0, match.index))) continue
    if (!stubbed) return true
  }
  return false
}
