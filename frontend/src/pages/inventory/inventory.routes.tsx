import React from 'react'
import type { RouteObject } from 'react-router-dom'

const InventoryPage = React.lazy(() => import('./InventoryPage'))
const ProductsPage = React.lazy(() => import('./ProductsPage'))
const CreateProductPage = React.lazy(() => import('./CreateProductPage'))
const ProductViewPage = React.lazy(() => import('./ProductViewPage'))
const CategoriesPage = React.lazy(() => import('./CategoriesPage'))
const StockAdjustmentsPage = React.lazy(() => import('./StockAdjustmentsPage'))
const CreateStockAdjustmentPage = React.lazy(() => import('./CreateStockAdjustmentPage'))
const InventorySummaryReport = React.lazy(() => import('./InventorySummaryReport'))
const HistoricalInventoryReport = React.lazy(() => import('./HistoricalInventoryReport'))
const MovementSummaryReport = React.lazy(() => import('./MovementSummaryReport'))
const PriceListReport = React.lazy(() => import('./PriceListReport'))
const ProductCostReport = React.lazy(() => import('./ProductCostReport'))

export const inventoryRoutes: RouteObject[] = [
  { path: '/inventory', element: <InventoryPage />, handle: { title: 'Inventory' } },
  { path: '/inventory/products', element: <ProductsPage />, handle: { title: 'Products' } },
  { path: '/inventory/products/create', element: <CreateProductPage />, handle: { title: 'Create Product' } },
  { path: '/inventory/products/:slug/view', element: <ProductViewPage />, handle: { title: 'Product', breadcrumbParam: 'slug' } },
  { path: '/inventory/products/:slug/edit', element: <CreateProductPage />, handle: { title: 'Edit Product' } },
  { path: '/inventory/categories', element: <CategoriesPage />, handle: { title: 'Categories' } },
  { path: '/inventory/stock-adjustments', element: <StockAdjustmentsPage />, handle: { title: 'Stock Adjustments' } },
  { path: '/inventory/stock-adjustments/create', element: <CreateStockAdjustmentPage />, handle: { title: 'Create Stock Adjustment' } },
  { path: '/inventory/stock-adjustments/:adjustmentNumber/edit', element: <CreateStockAdjustmentPage />, handle: { title: 'Edit Stock Adjustment' } },
  { path: '/reports/inventory/summary', element: <InventorySummaryReport />, handle: { title: 'Inventory Summary' } },
  { path: '/reports/inventory/historical', element: <HistoricalInventoryReport />, handle: { title: 'Historical Inventory' } },
  { path: '/reports/inventory/movement-summary', element: <MovementSummaryReport />, handle: { title: 'Inventory Movement Summary' } },
  { path: '/reports/inventory/price-list', element: <PriceListReport />, handle: { title: 'Product Price List' } },
  { path: '/reports/inventory/product-cost', element: <ProductCostReport />, handle: { title: 'Product Cost Report' } },
]
