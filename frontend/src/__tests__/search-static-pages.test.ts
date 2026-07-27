// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { router } from '@/router'

const SEARCH_SERVICE = resolve(
  __dirname,
  '../../../backend/src/modules/search/search.service.ts',
)

/**
 * Extract the `route` values from the STATIC_PAGES array literal via the
 * TypeScript AST.
 *
 * Parsed rather than pattern-matched on purpose. A regex over the source is
 * quote-style sensitive, and the backend has no Prettier config — so its
 * `singleQuote` defaults to false and `npm run format` rewrites these strings
 * to double quotes. A single-quote-only regex would drop entries while the
 * length floor below still passed, hiding a dead route.
 *
 * Strict by design: every array element must be an object literal with exactly
 * one statically resolvable `route`. Anything else — a spread, an identifier
 * reference, a concatenation, a substituted template — throws rather than
 * being skipped. A permissive walk that collected only what it recognized
 * would silently drop unreadable entries, and those entries would never be
 * checked against the router while the floor stayed satisfied by their
 * neighbours. If a future entry legitimately needs one of these forms, teach
 * this parser to resolve it; do not loosen it to ignore what it cannot read.
 *
 * Scoping to the STATIC_PAGES declaration is also load-bearing:
 * search.service.ts has `route` properties outside the array, in
 * result-building code.
 */
function staticPageRoutes(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    'search.service.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  )

  // Collect every binding rather than keeping the last one seen: a shadowing
  // declaration inside a helper would otherwise silently replace the
  // module-level array, leaving the real list unchecked while both assertions
  // below still passed.
  const declarations: ts.VariableDeclaration[] = []

  const findDeclarations = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'STATIC_PAGES'
    ) {
      declarations.push(node)
      return
    }
    ts.forEachChild(node, findDeclarations)
  }
  findDeclarations(sourceFile)

  if (declarations.length === 0) {
    throw new Error('STATIC_PAGES declaration not found in search.service.ts')
  }
  if (declarations.length > 1) {
    throw new Error(
      `search.service.ts has ${declarations.length} STATIC_PAGES declarations; expected exactly one`,
    )
  }

  const [declaration] = declarations
  if (!declaration.initializer) {
    throw new Error('STATIC_PAGES has no initializer')
  }
  if (!ts.isArrayLiteralExpression(declaration.initializer)) {
    throw new Error('STATIC_PAGES is not an array literal')
  }

  const describe_ = (node: ts.Node): string =>
    node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 80)

  /** Resolve a string literal or a template with no substitutions. */
  const staticString = (node: ts.Expression): string | undefined => {
    if (ts.isStringLiteral(node)) return node.text
    if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text
    return undefined
  }

  /** Match `route`, `'route'`, and `"route"` property names. */
  const isRouteKey = (name: ts.PropertyName): boolean =>
    (ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === 'route'

  return declaration.initializer.elements.map((element, index) => {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new Error(
        `STATIC_PAGES[${index}] is not an object literal: ${describe_(element)}`,
      )
    }

    const routeValues = element.properties.flatMap((property) => {
      if (ts.isPropertyAssignment(property) && isRouteKey(property.name)) {
        const value = staticString(property.initializer)
        if (value === undefined) {
          throw new Error(
            `STATIC_PAGES[${index}] has a non-static route: ${describe_(property.initializer)}`,
          )
        }
        return [value]
      }
      // Shorthand (`route`) and spreads cannot be resolved from this file alone.
      if (
        ts.isShorthandPropertyAssignment(property) &&
        property.name.text === 'route'
      ) {
        throw new Error(
          `STATIC_PAGES[${index}] uses shorthand for route: ${describe_(property)}`,
        )
      }
      if (ts.isSpreadAssignment(property)) {
        throw new Error(
          `STATIC_PAGES[${index}] spreads into the entry: ${describe_(property)}`,
        )
      }
      return []
    })

    if (routeValues.length !== 1) {
      throw new Error(
        `STATIC_PAGES[${index}] must define exactly one route, found ${routeValues.length}: ${describe_(element)}`,
      )
    }

    return routeValues[0]
  })
}

function searchServiceRoutes(): string[] {
  return staticPageRoutes(readFileSync(SEARCH_SERVICE, 'utf8'))
}

function mountedRoutes(): string[] {
  const walk = (routes: any[], base = ''): string[] =>
    routes.flatMap((route) => {
      const path = route.path?.startsWith('/')
        ? route.path
        : route.path
          ? `${base}/${route.path}`
          : base
      return [
        ...(route.path ? [path] : []),
        ...(route.children ? walk(route.children, path) : []),
      ]
    })
  return walk(router.routes as any[])
}

describe('staticPageRoutes extraction', () => {
  it.each([
    ['single quotes', `const STATIC_PAGES = [{ label: 'A', route: '/a' }];`],
    ['double quotes', `const STATIC_PAGES = [{ label: "A", route: "/a" }];`],
  ])('extracts routes written with %s', (_style, source) => {
    expect(staticPageRoutes(source)).toEqual(['/a'])
  })

  it.each([
    ['no-substitution template', 'const STATIC_PAGES = [{ route: `/a` }];'],
    ['single-quoted property name', `const STATIC_PAGES = [{ 'route': '/a' }];`],
    ['double-quoted property name', `const STATIC_PAGES = [{ "route": '/a' }];`],
  ])('extracts routes written with a %s', (_form, source) => {
    expect(staticPageRoutes(source)).toEqual(['/a'])
  })

  it('ignores route properties declared outside STATIC_PAGES', () => {
    const source = [
      `const unrelated = { route: '/before' };`,
      `const STATIC_PAGES = [{ route: '/inside' }];`,
      `function build() { return { route: '/after' } }`,
    ].join('\n')

    expect(staticPageRoutes(source)).toEqual(['/inside'])
  })

  // Each of these silently produced no route under the previous permissive
  // walk, so the entry went unchecked while the length floor still passed.
  it.each([
    ['an identifier reference', `const STATIC_PAGES = [{ route: SOME_CONST }];`],
    ['a concatenation', `const STATIC_PAGES = [{ route: '/a' + suffix }];`],
    ['a substituted template', 'const STATIC_PAGES = [{ route: `/a/${id}` }];'],
    ['shorthand', `const STATIC_PAGES = [{ route }];`],
    ['a spread element', `const STATIC_PAGES = [...OTHER_PAGES];`],
    ['a spread inside an entry', `const STATIC_PAGES = [{ ...base, label: 'A' }];`],
    ['no route at all', `const STATIC_PAGES = [{ label: 'A' }];`],
    ['a computed property name', `const STATIC_PAGES = [{ ['route']: '/a' }];`],
  ])('throws rather than skipping %s', (_form, source) => {
    expect(() => staticPageRoutes(source)).toThrow()
  })

  it('throws when the declaration is missing', () => {
    expect(() => staticPageRoutes(`const OTHER = [{ route: '/a' }];`)).toThrow(
      /STATIC_PAGES declaration not found/,
    )
  })

  it('throws rather than picking one of several STATIC_PAGES declarations', () => {
    const source = [
      `const STATIC_PAGES = [{ route: '/outer' }];`,
      `function scoped() { const STATIC_PAGES = [{ route: '/inner' }]; return STATIC_PAGES }`,
    ].join('\n')

    expect(() => staticPageRoutes(source)).toThrow(
      /2 STATIC_PAGES declarations; expected exactly one/,
    )
  })
})

describe('search STATIC_PAGES vs mounted router', () => {
  it('parses a plausible number of unique routes from STATIC_PAGES', () => {
    const routes = searchServiceRoutes()
    expect(routes.length).toBeGreaterThan(20)
    expect(new Set(routes).size).toBe(routes.length)
  })

  it('every STATIC_PAGES route matches a mounted route exactly', () => {
    const mounted = new Set(mountedRoutes())
    const dead = searchServiceRoutes().filter((route) => !mounted.has(route))
    expect(dead).toEqual([])
  })
})
