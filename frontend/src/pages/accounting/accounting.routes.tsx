import React from 'react'
import { Navigate } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'

const AccountingDashboardPage = React.lazy(() => import('./AccountingDashboardPage'))
const ChartOfAccountsPage = React.lazy(() => import('./ChartOfAccountsPage'))
const FiscalPeriodsPage = React.lazy(() => import('./FiscalPeriodsPage'))
const JournalEntriesPage = React.lazy(() => import('./JournalEntriesPage'))
const AccountMappingsPage = React.lazy(() => import('./AccountMappingsPage'))
const BankReconciliationsPage = React.lazy(() => import('./BankReconciliationsPage'))
const SettlementsPage = React.lazy(() => import('./SettlementsPage'))
const OwnerEquityPage = React.lazy(() => import('./OwnerEquityPage'))
const ExpensesPage = React.lazy(() => import('./ExpensesPage'))
const FundTransfersPage = React.lazy(() => import('./FundTransfersPage'))
const TrialBalancePage = React.lazy(() => import('./reports/TrialBalancePage'))
const BalanceSheetPage = React.lazy(() => import('./reports/BalanceSheetPage'))
const ProfitAndLossPage = React.lazy(() => import('./reports/ProfitAndLossPage'))
const GeneralLedgerPage = React.lazy(() => import('./reports/GeneralLedgerPage'))
const AccountActivityPage = React.lazy(() => import('./reports/AccountActivityPage'))

export const accountingRoutes: RouteObject[] = [
  { path: '/accounting', element: <Navigate to="/accounting/dashboard" replace /> },
  { path: '/accounting/dashboard', element: <AccountingDashboardPage />, handle: { title: 'Dashboard' } },
  { path: '/accounting/chart-of-accounts', element: <ChartOfAccountsPage />, handle: { title: 'Chart of Accounts' } },
  { path: '/accounting/fiscal-periods', element: <FiscalPeriodsPage />, handle: { title: 'Fiscal Periods' } },
  { path: '/accounting/journal-entries', element: <JournalEntriesPage />, handle: { title: 'Journal Entries' } },
  { path: '/accounting/journal-entries/:id', element: <Navigate to="/accounting/journal-entries" replace /> },
  { path: '/accounting/account-mappings', element: <AccountMappingsPage />, handle: { title: 'Account Mappings' } },
  { path: '/accounting/settlements', element: <SettlementsPage />, handle: { title: 'Settlements' } },
  { path: '/accounting/owner-equity', element: <OwnerEquityPage />, handle: { title: "Owner's Equity" } },
  { path: '/accounting/expenses', element: <ExpensesPage />, handle: { title: 'Expenses' } },
  { path: '/accounting/fund-transfers', element: <FundTransfersPage />, handle: { title: 'Fund Transfers' } },
  { path: '/accounting/bank-reconciliations', element: <BankReconciliationsPage />, handle: { title: 'Bank Reconciliation' } },
  { path: '/accounting/bank-reconciliations/new', element: <BankReconciliationsPage />, handle: { title: 'New Bank Reconciliation' } },
  { path: '/accounting/bank-reconciliations/:id', element: <Navigate to="/accounting/bank-reconciliations" replace /> },
  { path: '/accounting/reports/trial-balance', element: <TrialBalancePage />, handle: { title: 'Trial Balance' } },
  { path: '/accounting/reports/balance-sheet', element: <BalanceSheetPage />, handle: { title: 'Balance Sheet' } },
  { path: '/accounting/reports/profit-loss', element: <ProfitAndLossPage />, handle: { title: 'Profit & Loss' } },
  { path: '/accounting/reports/general-ledger', element: <GeneralLedgerPage />, handle: { title: 'General Ledger' } },
  { path: '/accounting/reports/account-activity', element: <AccountActivityPage />, handle: { title: 'Account Activity' } },
]
