import React from 'react'
import type { RouteObject } from 'react-router-dom'

const PurchasingPage = React.lazy(() => import('./PurchasingPage'))
const SuppliersPage = React.lazy(() => import('./SuppliersPage'))
const SupplierFormPage = React.lazy(() => import('./SupplierFormPage'))
const SupplierProfilePage = React.lazy(() => import('./SupplierProfilePage'))
const PurchaseOrdersPage = React.lazy(() => import('./PurchaseOrdersPage'))
const CreatePurchaseOrderPage = React.lazy(() => import('./CreatePurchaseOrderPage'))
const PurchaseOrderDetailPage = React.lazy(() => import('./PurchaseOrderDetailPage'))


export const purchasingRoutes: RouteObject[] = [
  { path: '/purchasing', element: <PurchasingPage />, handle: { title: 'Purchasing' } },
  { path: '/purchasing/suppliers', element: <SuppliersPage />, handle: { title: 'Suppliers' } },
  { path: '/purchasing/suppliers/create', element: <SupplierFormPage />, handle: { title: 'New Supplier' } },
  { path: '/purchasing/suppliers/:slug/edit', element: <SupplierFormPage />, handle: { title: 'Edit Supplier' } },
  { path: '/purchasing/suppliers/:slug/view', element: <SupplierProfilePage />, handle: { title: 'Supplier Profile' } },
  { path: '/purchasing/orders', element: <PurchaseOrdersPage />, handle: { title: 'Purchase Orders' } },
  { path: '/purchasing/orders/create', element: <CreatePurchaseOrderPage />, handle: { title: 'Create Purchase Order' } },
  { path: '/purchasing/orders/:orderNumber/view', element: <PurchaseOrderDetailPage />, handle: { title: 'Purchase Order', breadcrumbParam: 'orderNumber' } },
  { path: '/purchasing/orders/:orderNumber/edit', element: <CreatePurchaseOrderPage />, handle: { title: 'Edit Purchase Order' } },
  
]
