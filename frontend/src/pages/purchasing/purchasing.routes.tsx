import React from 'react'
import type { RouteObject } from 'react-router-dom'

const PurchasingPage = React.lazy(() => import('./PurchasingPage'))
const SuppliersPage = React.lazy(() => import('./SuppliersPage'))
const SupplierFormPage = React.lazy(() => import('./SupplierFormPage'))
const SupplierProfilePage = React.lazy(() => import('./SupplierProfilePage'))
const PurchaseOrdersPage = React.lazy(() => import('./PurchaseOrdersPage'))
const CreatePurchaseOrderPage = React.lazy(() => import('./CreatePurchaseOrderPage'))
const GoodsReceivedPage = React.lazy(() => import('./GoodsReceivedPage'))
const VendorPaymentsPage = React.lazy(() => import('./VendorPaymentsPage'))
const PurchaseOrderSummary = React.lazy(() => import('./PurchaseOrderSummary'))
const PurchaseOrderDetailsReport = React.lazy(() => import('./PurchaseOrderDetailsReport'))
const PurchaseOrderStatusReport = React.lazy(() => import('./PurchaseOrderStatusReport'))
const VendorPaymentDetailsReport = React.lazy(() => import('./VendorPaymentDetailsReport'))
const VendorProductListReport = React.lazy(() => import('./VendorProductListReport'))

export const purchasingRoutes: RouteObject[] = [
  { path: '/purchasing', element: <PurchasingPage />, handle: { title: 'Purchasing' } },
  { path: '/purchasing/suppliers', element: <SuppliersPage />, handle: { title: 'Suppliers' } },
  { path: '/purchasing/suppliers/create', element: <SupplierFormPage />, handle: { title: 'New Supplier' } },
  { path: '/purchasing/suppliers/:slug/edit', element: <SupplierFormPage />, handle: { title: 'Edit Supplier' } },
  { path: '/purchasing/suppliers/:slug/view', element: <SupplierProfilePage />, handle: { title: 'Supplier Profile' } },
  { path: '/purchasing/orders', element: <PurchaseOrdersPage />, handle: { title: 'Purchase Orders' } },
  { path: '/purchasing/orders/create', element: <CreatePurchaseOrderPage />, handle: { title: 'Create Purchase Order' } },
  { path: '/purchasing/orders/:orderNumber/edit', element: <CreatePurchaseOrderPage />, handle: { title: 'Edit Purchase Order' } },
  { path: '/purchasing/goods-received', element: <GoodsReceivedPage />, handle: { title: 'Goods Received' } },
  { path: '/purchasing/vendor-payments', element: <VendorPaymentsPage />, handle: { title: 'Vendor Payments' } },
  { path: '/reports/purchasing/order-summary', element: <PurchaseOrderSummary />, handle: { title: 'Purchase Order Summary' } },
  { path: '/reports/purchasing/order-status', element: <PurchaseOrderStatusReport />, handle: { title: 'Purchase Order Status' } },
  { path: '/reports/purchasing/order-details', element: <PurchaseOrderDetailsReport />, handle: { title: 'Purchase Order Details' } },
  { path: '/reports/purchasing/payment-details', element: <VendorPaymentDetailsReport />, handle: { title: 'Vendor Payment Details' } },
  { path: '/reports/purchasing/vendor-purchase-list', element: <VendorProductListReport />, handle: { title: 'Vendor Product List' } },
]
