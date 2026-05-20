// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pagesDir = resolve(__dirname, '../pages')

const settingsRoutes = readFileSync(resolve(pagesDir, 'settings/settings.routes.tsx'), 'utf8')
const salesRoutes = readFileSync(resolve(pagesDir, 'sales/sales.routes.tsx'), 'utf8')

describe('router settings paths', () => {
  it('redirects legacy inventory costing path to /settings/inventory-costing', () => {
    expect(settingsRoutes).toContain("{ path: '/settings/price-costing', element: <Navigate to=\"/settings/inventory-costing\" replace /> }")
  })

  it('defines the inventory costing page at /settings/inventory-costing', () => {
    expect(settingsRoutes).toContain("{ path: '/settings/inventory-costing', element: <InventoryCostingPage />, handle: { title: 'Inventory Costing' } }")
  })

  it('defines customer create and edit routes and removes the old customer profile route', () => {
    expect(salesRoutes).toContain("const CustomerFormPage = React.lazy(() => import('./CustomerFormPage'))")
    expect(salesRoutes).toContain("{ path: '/sales/customers/create', element: <CustomerFormPage />, handle: { title: 'New Customer' } }")
    expect(salesRoutes).toContain("{ path: '/sales/customers/:slug/edit', element: <CustomerFormPage />, handle: { title: 'Edit Customer' } }")
    expect(salesRoutes).not.toContain('CustomerProfilePage')
    expect(salesRoutes).not.toContain("{ path: '/sales/customers/:id', element: <CustomerProfilePage />, handle: { title: 'Customer Profile' } }")
  })
})
