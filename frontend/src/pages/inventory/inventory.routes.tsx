import React from 'react'
import type { RouteObject } from 'react-router-dom'

const InventoryPage = React.lazy(() => import('./InventoryPage'))
const ProductsPage = React.lazy(() => import('./ProductsPage'))
const CreateProductPage = React.lazy(() => import('./CreateProductPage'))
const ProductViewPage = React.lazy(() => import('./ProductViewPage'))
const CategoriesPage = React.lazy(() => import('./CategoriesPage'))
const CategoryFormPage = React.lazy(() => import('./CategoryFormPage'))
const CategoryViewPage = React.lazy(() => import('./CategoryViewPage'))
const StockAdjustmentsPage = React.lazy(() => import('./StockAdjustmentsPage'))
const CreateStockAdjustmentPage = React.lazy(() => import('./CreateStockAdjustmentPage'))
const StockAdjustmentViewPage = React.lazy(() => import('./StockAdjustmentViewPage'))


export const inventoryRoutes: RouteObject[] = [
  { path: '/inventory', element: <InventoryPage />, handle: { title: 'Inventory' } },
  { path: '/inventory/products', element: <ProductsPage />, handle: { title: 'Products' } },
  { path: '/inventory/products/create', element: <CreateProductPage />, handle: { title: 'Create Product' } },
  { path: '/inventory/products/:slug/view', element: <ProductViewPage />, handle: { title: 'Product', breadcrumbParam: 'slug' } },
  { path: '/inventory/products/:slug/edit', element: <CreateProductPage />, handle: { title: 'Edit Product' } },
  { path: '/inventory/categories', element: <CategoriesPage />, handle: { title: 'Categories' } },
  { path: '/inventory/categories/create', element: <CategoryFormPage />, handle: { title: 'Create Category' } },
  { path: '/inventory/categories/:slug/view', element: <CategoryViewPage />, handle: { title: 'Category', breadcrumbParam: 'slug' } },
  { path: '/inventory/categories/:slug/edit', element: <CategoryFormPage />, handle: { title: 'Edit Category' } },
  { path: '/inventory/stock-adjustments', element: <StockAdjustmentsPage />, handle: { title: 'Stock Adjustments' } },
  { path: '/inventory/stock-adjustments/create', element: <CreateStockAdjustmentPage />, handle: { title: 'Create Stock Adjustment' } },
  { path: '/inventory/stock-adjustments/:id/view', element: <StockAdjustmentViewPage />, handle: { title: 'Stock Adjustment' } },
  { path: '/inventory/stock-adjustments/:id/edit', element: <CreateStockAdjustmentPage />, handle: { title: 'Edit Stock Adjustment' } },
  
]
