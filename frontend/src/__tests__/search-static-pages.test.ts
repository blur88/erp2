// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { router } from '@/router'

const SEARCH_SERVICE = resolve(
  __dirname,
  '../../../backend/src/modules/search/search.service.ts',
)

function staticPageRoutes(): string[] {
  const source = readFileSync(SEARCH_SERVICE, 'utf8')
  const start = source.indexOf('const STATIC_PAGES')
  expect(start).toBeGreaterThan(-1)
  const end = source.indexOf('\n];', start)
  expect(end).toBeGreaterThan(start)

  const block = source.slice(start, end)
  return [...block.matchAll(/route: '([^']+)'/g)].map((m) => m[1])
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

describe('search STATIC_PAGES vs mounted router', () => {
  it('parses a plausible number of unique routes from STATIC_PAGES', () => {
    const routes = staticPageRoutes()
    expect(routes.length).toBeGreaterThan(20)
    expect(new Set(routes).size).toBe(routes.length)
  })

  it('every STATIC_PAGES route matches a mounted route exactly', () => {
    const mounted = new Set(mountedRoutes())
    const dead = staticPageRoutes().filter((route) => !mounted.has(route))
    expect(dead).toEqual([])
  })
})
