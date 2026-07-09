// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pagesDir = resolve(__dirname, '../pages')

const authRoutes = readFileSync(resolve(pagesDir, 'auth/auth.routes.tsx'), 'utf8')
const dashboardRoutes = readFileSync(resolve(pagesDir, 'dashboard/dashboard.routes.tsx'), 'utf8')
const inventoryRoutes = readFileSync(resolve(pagesDir, 'inventory/inventory.routes.tsx'), 'utf8')
const salesRoutes = readFileSync(resolve(pagesDir, 'sales/sales.routes.tsx'), 'utf8')
const purchasingRoutes = readFileSync(resolve(pagesDir, 'purchasing/purchasing.routes.tsx'), 'utf8')
const settingsRoutes = readFileSync(resolve(pagesDir, 'settings/settings.routes.tsx'), 'utf8')
const auditLogsRoutes = readFileSync(resolve(pagesDir, 'audit-logs/audit-logs.routes.tsx'), 'utf8')

describe('domain route file smoke tests', () => {
  it('auth routes define login and password change paths', () => {
    expect(authRoutes).toContain("path: '/login'")
    expect(authRoutes).toContain("path: '/change-password-required'")
  })

  it('dashboard routes define the dashboard path', () => {
    expect(dashboardRoutes).toContain("path: '/dashboard'")
  })

  it('inventory routes define products and stock adjustment paths', () => {
    expect(inventoryRoutes).toContain("path: '/inventory/products'")
    expect(inventoryRoutes).toContain("path: '/inventory/stock-adjustments'")
  })

  it('purchasing routes define suppliers list before create/edit', () => {
    const suppliersListIndex = purchasingRoutes.indexOf("path: '/purchasing/suppliers'")
    const suppliersCreateIndex = purchasingRoutes.indexOf("path: '/purchasing/suppliers/create'")
    expect(suppliersListIndex).toBeLessThan(suppliersCreateIndex)
  })

  it('audit-logs routes define the audit-logs path', () => {
    expect(auditLogsRoutes).toContain("path: '/audit-logs'")
  })
})

describe('router settings paths', () => {
  it('redirects legacy inventory costing path to /settings/inventory-costing', () => {
    expect(settingsRoutes).toContain("{ path: '/settings/price-costing', element: <Navigate to=\"/settings/inventory-costing\" replace /> }")
  })

  it('defines the inventory costing page at /settings/inventory-costing', () => {
    expect(settingsRoutes).toContain("{ path: '/settings/inventory-costing', element: <InventoryCostingPage />, handle: { title: 'Inventory Costing' } }")
  })

  it('defines customer create, edit, and slug-based profile routes', () => {
    expect(salesRoutes).toContain("const CustomerFormPage = React.lazy(() => import('./CustomerFormPage'))")
    expect(salesRoutes).toContain("const CustomerProfilePage = React.lazy(() => import('./CustomerProfilePage'))")
    expect(salesRoutes).toContain("{ path: '/sales/customers/create', element: <CustomerFormPage />, handle: { title: 'New Customer' } }")
    expect(salesRoutes).toContain("{ path: '/sales/customers/:slug/edit', element: <CustomerFormPage />, handle: { title: 'Edit Customer' } }")
    expect(salesRoutes).toContain("{ path: '/sales/customers/:slug/view', element: <CustomerProfilePage />, handle: { title: 'Customer Profile' } }")
    expect(salesRoutes).not.toContain("{ path: '/sales/customers/:id', element: <CustomerProfilePage />, handle: { title: 'Customer Profile' } }")
  })
})
