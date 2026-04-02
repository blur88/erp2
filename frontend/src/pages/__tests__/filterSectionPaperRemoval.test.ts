import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const filesToKeepFlat = [
  'src/pages/settings/BackupManagement.tsx',
  'src/pages/accounting/ChartOfAccountsPage.tsx',
  'src/pages/accounting/JournalEntriesPage.tsx',
  'src/pages/accounting/BankReconciliationsPage.tsx',
  'src/pages/accounting/FiscalPeriodsPage.tsx',
  'src/pages/inventory/CategoriesPage.tsx',
  'src/pages/purchasing/VendorPaymentsPage.tsx',
  'src/pages/purchasing/GoodsReceivedPage.tsx',
  'src/pages/sales/components/OrdersToolbar.tsx',
  'src/pages/sales/components/InvoicesToolbar.tsx',
  'src/pages/inventory/components/ProductsToolbar.tsx',
  'src/pages/purchasing/components/PurchaseOrdersToolbar.tsx',
]

describe('filter sections use flat wrappers', () => {
  it.each(filesToKeepFlat)('does not use the legacy Paper wrapper in %s', (relativePath) => {
    const source = readFileSync(resolve(import.meta.dirname, '../../../', relativePath), 'utf8')

    expect(source).not.toContain('<Paper sx={{ p: 2, mb: 3 }}>')
  })
})
