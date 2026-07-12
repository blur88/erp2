import React from 'react'
import type { RouteObject } from 'react-router-dom'

const ChartOfAccountsPage = React.lazy(() => import('./ChartOfAccountsPage'))
const AccountingSettingsPage = React.lazy(() => import('./AccountingSettingsPage'))
const JournalEntriesPage = React.lazy(() => import('./JournalEntriesPage'))
const JournalEntryViewPage = React.lazy(() => import('./JournalEntryViewPage'))
const GeneralLedgerPage = React.lazy(() => import('./GeneralLedgerPage'))
const TrialBalancePage = React.lazy(() => import('./TrialBalancePage'))

// Authentication is enforced by the parent router (authLoader + MainLayout in
// router.tsx), not here. These routes carry no role restriction: accounting is
// open to every authenticated user (#895).
export const accountingRoutes: RouteObject[] = [
  { path: '/accounting/chart-of-accounts', element: <ChartOfAccountsPage />, handle: { title: 'Chart of Accounts' } },
  { path: '/accounting/settings', element: <AccountingSettingsPage />, handle: { title: 'Accounting Settings' } },
  { path: '/accounting/journal-entries', element: <JournalEntriesPage />, handle: { title: 'Journal Entries' } },
  { path: '/accounting/journal-entries/:id', element: <JournalEntryViewPage />, handle: { title: 'Journal Entry' } },
  { path: '/accounting/general-ledger', element: <GeneralLedgerPage />, handle: { title: 'General Ledger' } },
  { path: '/accounting/trial-balance', element: <TrialBalancePage />, handle: { title: 'Trial Balance' } },
]
