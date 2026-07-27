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
 * to double quotes. A single-quote-only regex would then drop entries while
 * the length floor below still passed, hiding a dead route.
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

  const routes: string[] = []
  let foundDeclaration = false

  const collectRoutes = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'route' &&
      ts.isStringLiteral(node.initializer)
    ) {
      routes.push(node.initializer.text)
    }
    ts.forEachChild(node, collectRoutes)
  }

  const findDeclaration = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'STATIC_PAGES' &&
      node.initializer
    ) {
      foundDeclaration = true
      ts.forEachChild(node.initializer, collectRoutes)
    }
    ts.forEachChild(node, findDeclaration)
  }

  findDeclaration(sourceFile)
  expect(foundDeclaration).toBe(true)

  return routes
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

  it('ignores route properties declared outside STATIC_PAGES', () => {
    const source = [
      `const unrelated = { route: '/before' };`,
      `const STATIC_PAGES = [{ route: '/inside' }];`,
      `function build() { return { route: '/after' } }`,
    ].join('\n')

    expect(staticPageRoutes(source)).toEqual(['/inside'])
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
