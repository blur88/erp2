import React from 'react'
import type { RouteObject } from 'react-router-dom'

const ChartOfAccountsPage = React.lazy(() => import('./ChartOfAccountsPage'))
const AccountingSettingsPage = React.lazy(() => import('./AccountingSettingsPage'))
const JournalEntriesPage = React.lazy(() => import('./JournalEntriesPage'))
const JournalEntryViewPage = React.lazy(() => import('./JournalEntryViewPage'))
const GeneralLedgerPage = React.lazy(() => import('./GeneralLedgerPage'))
const TrialBalancePage = React.lazy(() => import('./TrialBalancePage'))
const ExpensesPage = React.lazy(() => import('./expenses/ExpensesPage'))
const ExpenseFormPage = React.lazy(() => import('./expenses/ExpenseFormPage'))
const ExpenseDetailPage = React.lazy(() => import('./expenses/ExpenseDetailPage'))
const OwnerEquityPage = React.lazy(() => import('./owner-equity/OwnerEquityPage'))
const OwnerEquityFormPage = React.lazy(() => import('./owner-equity/OwnerEquityFormPage'))
const OwnerEquityDetailPage = React.lazy(() => import('./owner-equity/OwnerEquityDetailPage'))

// Authentication is enforced by the parent router (authLoader + MainLayout in
// router.tsx), not here. These routes carry no role restriction: accounting is
// open to every authenticated user (#895).
export const accountingRoutes: RouteObject[] = [
  { path: '/accounting/chart-of-accounts', element: <ChartOfAccountsPage />, handle: { title: 'Chart of Accounts' } },
  { path: '/accounting/settings', element: <AccountingSettingsPage />, handle: { title: 'Accounting Settings' } },
  { path: '/accounting/journal-entries', element: <JournalEntriesPage />, handle: { title: 'Journal Entries' } },
  { path: '/accounting/journal-entries/:id', element: <JournalEntryViewPage />, handle: { title: 'Journal Entry' } },
  { path: '/accounting/expenses', element: <ExpensesPage />, handle: { title: 'Expenses' } },
  { path: '/accounting/expenses/new', element: <ExpenseFormPage />, handle: { title: 'New Expense' } },
  { path: '/accounting/expenses/:id/edit', element: <ExpenseFormPage />, handle: { title: 'Edit Expense' } },
  { path: '/accounting/expenses/:id', element: <ExpenseDetailPage />, handle: { title: 'Expense Detail' } },
  { path: '/accounting/owner-equity', element: <OwnerEquityPage />, handle: { title: 'Owner Equity' } },
  { path: '/accounting/owner-equity/create', element: <OwnerEquityFormPage />, handle: { title: 'New Owner Equity' } },
  { path: '/accounting/owner-equity/:referenceNumber/edit', element: <OwnerEquityFormPage />, handle: { title: 'Edit Owner Equity' } },
  { path: '/accounting/owner-equity/:referenceNumber/view', element: <OwnerEquityDetailPage />, handle: { title: 'Owner Equity Detail' } },
  { path: '/accounting/general-ledger', element: <GeneralLedgerPage />, handle: { title: 'General Ledger' } },
  { path: '/accounting/trial-balance', element: <TrialBalancePage />, handle: { title: 'Trial Balance' } },
]
