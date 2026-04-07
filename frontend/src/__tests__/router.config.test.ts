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

  it('defines customer create and edit routes and removes the old customer profile route', () => {
    expect(routerSource).toContain("const CustomerFormPage = React.lazy(() => import('./pages/sales/CustomerFormPage'))")
    expect(routerSource).toContain("{ path: '/sales/customers/create', element: <CustomerFormPage />, handle: { title: 'New Customer' } }")
    expect(routerSource).toContain("{ path: '/sales/customers/:id/edit', element: <CustomerFormPage />, handle: { title: 'Edit Customer' } }")
    expect(routerSource).not.toContain('CustomerProfilePage')
    expect(routerSource).not.toContain("{ path: '/sales/customers/:id', element: <CustomerProfilePage />, handle: { title: 'Customer Profile' } }")
  })
})
