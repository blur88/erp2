import React from 'react'
import type { RouteObject } from 'react-router-dom'

const SalesPage = React.lazy(() => import('./SalesPage'))
const CustomersPage = React.lazy(() => import('./CustomersPage'))
const CustomerFormPage = React.lazy(() => import('./CustomerFormPage'))
const OrdersPage = React.lazy(() => import('./OrdersPage'))
const CreateSalesOrderPage = React.lazy(() => import('./CreateSalesOrderPage'))
const InvoicesPage = React.lazy(() => import('./InvoicesPage'))
const PaymentsPage = React.lazy(() => import('./PaymentsPage'))
const SalesByProductSummary = React.lazy(() => import('./SalesByProductSummary'))
const SalesByProductDetails = React.lazy(() => import('./SalesByProductDetails'))
const SalesOrderSummary = React.lazy(() => import('./SalesOrderSummary'))
const SalesOrderProfitReport = React.lazy(() => import('./SalesOrderProfitReport'))
const CustomerPaymentSummary = React.lazy(() => import('./CustomerPaymentSummary'))
const CustomerPaymentByOrder = React.lazy(() => import('./CustomerPaymentByOrder'))
const CustomerPaymentDetails = React.lazy(() => import('./CustomerPaymentDetails'))
const CustomerOrderHistory = React.lazy(() => import('./CustomerOrderHistory'))
const ProductCustomerReport = React.lazy(() => import('./ProductCustomerReport'))

export const salesRoutes: RouteObject[] = [
  { path: '/sales', element: <SalesPage />, handle: { title: 'Sales' } },
  { path: '/sales/customers', element: <CustomersPage />, handle: { title: 'Customers' } },
  { path: '/sales/customers/create', element: <CustomerFormPage />, handle: { title: 'New Customer' } },
  { path: '/sales/customers/:slug/edit', element: <CustomerFormPage />, handle: { title: 'Edit Customer' } },
  { path: '/sales/orders', element: <OrdersPage />, handle: { title: 'Sales Orders' } },
  { path: '/sales/orders/create', element: <CreateSalesOrderPage />, handle: { title: 'Create Sales Order' } },
  { path: '/sales/orders/:orderNumber/edit', element: <CreateSalesOrderPage />, handle: { title: 'Edit Sales Order' } },
  { path: '/sales/invoices', element: <InvoicesPage />, handle: { title: 'Invoices' } },
  { path: '/sales/payments', element: <PaymentsPage />, handle: { title: 'Payments' } },
  { path: '/reports/sales/product-summary', element: <SalesByProductSummary />, handle: { title: 'Sales by Product Summary' } },
  { path: '/reports/sales/product-details', element: <SalesByProductDetails />, handle: { title: 'Sales by Product Details' } },
  { path: '/reports/sales/order-summary', element: <SalesOrderSummary />, handle: { title: 'Sales Order Summary' } },
  { path: '/reports/sales/order-profit', element: <SalesOrderProfitReport />, handle: { title: 'Sales Order Profit Report' } },
  { path: '/reports/sales/customer-payment-summary', element: <CustomerPaymentSummary />, handle: { title: 'Customer Payment Summary' } },
  { path: '/reports/sales/payment-by-order', element: <CustomerPaymentByOrder />, handle: { title: 'Customer Payment by Order' } },
  { path: '/reports/sales/payment-details', element: <CustomerPaymentDetails />, handle: { title: 'Customer Payment Details' } },
  { path: '/reports/sales/order-history', element: <CustomerOrderHistory />, handle: { title: 'Customer Order History' } },
  { path: '/reports/sales/product-customer', element: <ProductCustomerReport />, handle: { title: 'Product Customer Report' } },
]
