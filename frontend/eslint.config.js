import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: globals.browser,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh.plugin,
    },
    rules: {
      // react-hooks
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/rules-of-hooks': 'off',

      // react-refresh
      'react-refresh/only-export-components': 'off',

      // typescript-eslint — keep current permissive settings
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',

      // base ESLint
      'no-unassigned-vars': 'off',
      'no-useless-assignment': 'off',
      'no-unused-vars': 'off',
      'no-unused-expressions': 'off',
      'no-extra-semi': 'off',
      'no-extra-boolean-cast': 'off',
      'prefer-const': 'off',
      'no-useless-escape': 'off',
      'no-case-declarations': 'off',
      'deprecation/deprecation': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
  },

  // PageHeader migration guard — progressive enforcement
  //
  // Standard CRUD, list, and form pages must use <PageHeader> instead of TYPOGRAPHY_STYLES.pageHeader.
  // The files below are temporarily excluded because they are either:
  //   - Permanent exceptions (reports, dashboards, tree pages, auth) — see docs/ui.md#exception-categories
  //   - Deferred pages awaiting pattern validation — see docs/superpowers/specs/2026-03-24-issue-173-pageheader-phase4-design.md
  //   - Components that reuse TYPOGRAPHY_STYLES.pageHeader for its type scale (not as a page header)
  //
  // This ignore list should only shrink over time. Remove an entry when the page is migrated or
  // formally classified as a permanent exception. Promote severity to 'error' once the list is empty.
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: "MemberExpression[object.name='TYPOGRAPHY_STYLES'][property.name='pageHeader']",
          message: "Use <PageHeader> for standard CRUD/list/form pages instead of TYPOGRAPHY_STYLES.pageHeader. See docs/ui.md for usage rules and exception categories.",
        },
        {
          selector: "VariableDeclarator[init.name='TYPOGRAPHY_STYLES'] > ObjectPattern > Property[key.name='pageHeader']",
          message: "Do not destructure TYPOGRAPHY_STYLES.pageHeader — use <PageHeader> instead. See docs/ui.md.",
        },
      ],
    },
  },
  // Known exceptions/deferred — no-restricted-syntax disabled for these files only
  {
    files: [
      // Permanent exceptions (reports, dashboards, tree/hierarchy, audit, auth)
      'src/pages/accounting/AccountingDashboardPage.tsx',
      'src/pages/accounting/ChartOfAccountsPage.tsx',
      'src/pages/accounting/reports/AccountActivityPage.tsx',
      'src/pages/accounting/reports/BalanceSheetPage.tsx',
      'src/pages/accounting/reports/GeneralLedgerPage.tsx',
      'src/pages/accounting/reports/ProfitAndLossPage.tsx',
      'src/pages/accounting/reports/TrialBalancePage.tsx',
      'src/pages/audit-logs/AuditLogsPage.tsx',
      'src/pages/dashboard/DashboardPage.tsx',
      'src/pages/inventory/CategoriesPage.tsx',
      'src/pages/inventory/HistoricalInventoryReport.tsx',
      'src/pages/inventory/InventorySummaryReport.tsx',
      'src/pages/inventory/MovementSummaryReport.tsx',
      'src/pages/inventory/PriceListReport.tsx',
      'src/pages/inventory/ProductCostReport.tsx',
      'src/pages/purchasing/PurchaseOrderDetailsReport.tsx',
      'src/pages/purchasing/PurchaseOrderStatusReport.tsx',
      'src/pages/purchasing/PurchaseOrderSummary.tsx',
      'src/pages/purchasing/VendorPaymentDetailsReport.tsx',
      'src/pages/purchasing/VendorProductListReport.tsx',
      'src/pages/sales/CustomerOrderHistory.tsx',
      'src/pages/sales/CustomerPaymentByOrder.tsx',
      'src/pages/sales/CustomerPaymentDetails.tsx',
      'src/pages/sales/CustomerPaymentSummary.tsx',
      'src/pages/sales/ProductCustomerReport.tsx',
      'src/pages/sales/SalesByProductDetails.tsx',
      'src/pages/sales/SalesByProductSummary.tsx',
      'src/pages/sales/SalesOrderProfitReport.tsx',
      'src/pages/sales/SalesOrderSummary.tsx',
      // Deferred pages — awaiting pattern validation
      'src/pages/accounting/BankReconciliationDetailsPage.tsx',
      'src/pages/accounting/BankReconciliationsPage.tsx',
      'src/pages/accounting/JournalEntriesPage.tsx',
      'src/pages/accounting/JournalEntryDetailsPage.tsx',
      'src/pages/purchasing/PurchasingPage.tsx',
      'src/pages/settings/BackupManagement.tsx',
      'src/pages/settings/PriceListDetailsPage.tsx',
      // Components using TYPOGRAPHY_STYLES.pageHeader for its type scale (not as a page header)
      'src/pages/dashboard/components/DashboardStats.tsx',
      'src/pages/inventory/InventoryPage.tsx',
      'src/pages/sales/components/SalesStatsCards.tsx',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  // TablePagination guard — use <PagePagination> for a consistent pagination UI.
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@mui/material',
              importNames: ['TablePagination'],
              message:
                'Use <PagePagination> (components/common/PagePagination.tsx) for a consistent pagination UI. BackupList is the only sanctioned exception.',
            },
          ],
        },
      ],
    },
  },
  // Known exception — BackupList intentionally keeps raw TablePagination (see tableStyles.ts opt-out).
  {
    files: ['src/components/backup/BackupList.tsx'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
);
