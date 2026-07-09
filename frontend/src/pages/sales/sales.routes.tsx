import React from 'react'
import type { RouteObject } from 'react-router-dom'

const SalesPage = React.lazy(() => import('./SalesPage'))
const CustomersPage = React.lazy(() => import('./CustomersPage'))
const CustomerFormPage = React.lazy(() => import('./CustomerFormPage'))
const CustomerProfilePage = React.lazy(() => import('./CustomerProfilePage'))
const OrdersPage = React.lazy(() => import('./OrdersPage'))
const CreateSalesOrderPage = React.lazy(() => import('./CreateSalesOrderPage'))
const SalesOrderDetailPage = React.lazy(() => import('./SalesOrderDetailPage'))


export const salesRoutes: RouteObject[] = [
  { path: '/sales', element: <SalesPage />, handle: { title: 'Sales' } },
  { path: '/sales/customers', element: <CustomersPage />, handle: { title: 'Customers' } },
  { path: '/sales/customers/create', element: <CustomerFormPage />, handle: { title: 'New Customer' } },
  { path: '/sales/customers/:slug/edit', element: <CustomerFormPage />, handle: { title: 'Edit Customer' } },
  { path: '/sales/customers/:slug/view', element: <CustomerProfilePage />, handle: { title: 'Customer Profile' } },
  { path: '/sales/orders', element: <OrdersPage />, handle: { title: 'Sales Orders' } },
  { path: '/sales/orders/create', element: <CreateSalesOrderPage />, handle: { title: 'Create Sales Order' } },
  { path: '/sales/orders/:orderNumber/edit', element: <CreateSalesOrderPage />, handle: { title: 'Edit Sales Order' } },
  { path: '/sales/orders/:orderNumber/view', element: <SalesOrderDetailPage />, handle: { title: 'Sales Order', breadcrumbParam: 'orderNumber' } },
  
]
