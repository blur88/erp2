// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const routerSource = readFileSync(resolve(__dirname, '../router.tsx'), 'utf8')

describe('router settings paths', () => {
  it('redirects legacy inventory costing path to /settings/inventory-costing', () => {
    expect(routerSource).toContain("{ path: '/settings/price-costing', element: <Navigate to=\"/settings/inventory-costing\" replace /> }")
  })

  it('defines the inventory costing page at /settings/inventory-costing', () => {
    expect(routerSource).toContain("{ path: '/settings/inventory-costing', element: <InventoryCostingPage />, handle: { title: 'Inventory Costing' } }")
  })

  it('defines customer create and edit routes before the generic customer details route', () => {
    expect(routerSource).toContain("const CustomerFormPage = React.lazy(() => import('./pages/sales/CustomerFormPage'))")
    expect(routerSource).toContain("{ path: '/sales/customers/create', element: <CustomerFormPage />, handle: { title: 'New Customer' } }")
    expect(routerSource).toContain("{ path: '/sales/customers/:id/edit', element: <CustomerFormPage />, handle: { title: 'Edit Customer' } }")

    const createIndex = routerSource.indexOf("{ path: '/sales/customers/create'")
    const detailsIndex = routerSource.indexOf("{ path: '/sales/customers/:id'")

    expect(createIndex).toBeGreaterThan(-1)
    expect(detailsIndex).toBeGreaterThan(-1)
    expect(createIndex).toBeLessThan(detailsIndex)
  })
})
