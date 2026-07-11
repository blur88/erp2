import React from 'react'
import type { RouteObject } from 'react-router-dom'
import AdminRoute from '@/components/auth/AdminRoute'

const ChartOfAccountsPage = React.lazy(() => import('./ChartOfAccountsPage'))
const AccountingSettingsPage = React.lazy(() => import('./AccountingSettingsPage'))
const JournalEntriesPage = React.lazy(() => import('./JournalEntriesPage'))
const JournalEntryViewPage = React.lazy(() => import('./JournalEntryViewPage'))
const GeneralLedgerPage = React.lazy(() => import('./GeneralLedgerPage'))
const TrialBalancePage = React.lazy(() => import('./TrialBalancePage'))

export const accountingRoutes: RouteObject[] = [
  { path: '/accounting/chart-of-accounts', element: <AdminRoute><ChartOfAccountsPage /></AdminRoute>, handle: { title: 'Chart of Accounts' } },
  { path: '/accounting/settings', element: <AdminRoute><AccountingSettingsPage /></AdminRoute>, handle: { title: 'Accounting Settings' } },
  { path: '/accounting/journal-entries', element: <AdminRoute><JournalEntriesPage /></AdminRoute>, handle: { title: 'Journal Entries' } },
  { path: '/accounting/journal-entries/:id', element: <AdminRoute><JournalEntryViewPage /></AdminRoute>, handle: { title: 'Journal Entry' } },
  { path: '/accounting/general-ledger', element: <AdminRoute><GeneralLedgerPage /></AdminRoute>, handle: { title: 'General Ledger' } },
  { path: '/accounting/trial-balance', element: <AdminRoute><TrialBalancePage /></AdminRoute>, handle: { title: 'Trial Balance' } },
]
