import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store', () => ({
  store: {
    getState: vi.fn(() => ({
      auth: {
        isAuthenticated: true,
        user: { id: '1', requiresPasswordChange: false },
      },
    })),
  },
  persistor: {
    getState: vi.fn(() => ({ bootstrapped: true })),
    subscribe: vi.fn(),
  },
}))

import { router } from '@/router'

type RouteNode = {
  path?: string
  children?: RouteNode[]
  element?: unknown
  handle?: { title?: string }
}

function flattenRoutes(routes: RouteNode[]): RouteNode[] {
  return routes.flatMap((route) => [
    route,
    ...flattenRoutes(route.children ?? []),
  ])
}

describe('router settings paths', () => {
  it('redirects legacy inventory costing path to /settings/inventory-costing', () => {
    const routes = flattenRoutes((router as unknown as { routes: RouteNode[] }).routes)
    const legacyRoute = routes.find((route) => route.path === '/settings/price-costing')

    expect(legacyRoute).toBeDefined()
    expect((legacyRoute?.element as React.ReactElement<{ to: string }>).props.to).toBe('/settings/inventory-costing')
  })

  it('defines the inventory costing page at /settings/inventory-costing', () => {
    const routes = flattenRoutes((router as unknown as { routes: RouteNode[] }).routes)
    const inventoryCostingRoute = routes.find((route) => route.path === '/settings/inventory-costing')

    expect(inventoryCostingRoute?.handle?.title).toBe('Inventory Costing')
  })
})
