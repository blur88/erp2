import React from 'react'
import { Navigate } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'

const CompanySettingsPage = React.lazy(() => import('./CompanySettingsPage'))
const InventoryCostingPage = React.lazy(() => import('./InventoryCostingPage'))
const StockLevelSettingsPage = React.lazy(() => import('./StockLevelSettingsPage'))
const RegionalSettingsPage = React.lazy(() => import('./RegionalSettingsPage'))
const PrintSettingsPage = React.lazy(() => import('./PrintSettingsPage'))
const DocumentNumbersPage = React.lazy(() => import('./DocumentNumbersPage'))
const BackupManagement = React.lazy(() => import('./BackupManagement'))
const RedisMonitoringPage = React.lazy(() => import('./RedisMonitoringPage'))
const UserManagementPage = React.lazy(() => import('./UserManagementPage'))
const RoleManagementPage = React.lazy(() => import('./RoleManagementPage'))
const SecuritySettingsPage = React.lazy(() => import('./SecuritySettingsPage'))
const PriceListsPage = React.lazy(() => import('./PriceListsPage'))
const PriceListDetailsPage = React.lazy(() => import('./PriceListDetailsPage'))
const PaymentMethodsPage = React.lazy(() => import('./PaymentMethodsPage'))

export const settingsRoutes: RouteObject[] = [
  { path: '/settings/company', element: <CompanySettingsPage />, handle: { title: 'Company' } },
  { path: '/settings/price-costing', element: <Navigate to="/settings/inventory-costing" replace /> },
  { path: '/settings/inventory-costing', element: <InventoryCostingPage />, handle: { title: 'Inventory Costing' } },
  { path: '/settings/stock-levels', element: <StockLevelSettingsPage />, handle: { title: 'Stock Levels' } },
  { path: '/settings/regional', element: <RegionalSettingsPage />, handle: { title: 'Regional' } },
  { path: '/settings/price-lists', element: <PriceListsPage />, handle: { title: 'Price Lists' } },
  { path: '/settings/price-lists/:id', element: <PriceListDetailsPage />, handle: { title: 'Price List Details' } },
  { path: '/settings/payment-methods', element: <PaymentMethodsPage />, handle: { title: 'Payment Methods' } },
  { path: '/settings/print', element: <PrintSettingsPage />, handle: { title: 'Print Settings' } },
  { path: '/settings/document-numbers', element: <DocumentNumbersPage />, handle: { title: 'Document Numbers' } },
  { path: '/settings/users', element: <UserManagementPage />, handle: { title: 'Users' } },
  { path: '/settings/roles', element: <RoleManagementPage />, handle: { title: 'Roles & Permissions' } },
  { path: '/settings/security', element: <SecuritySettingsPage />, handle: { title: 'Security' } },
  { path: '/settings/backup', element: <BackupManagement />, handle: { title: 'Backup & Restore' } },
  { path: '/settings/redis-monitoring', element: <RedisMonitoringPage />, handle: { title: 'Redis Monitoring' } },
]
