import { Controller } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import { Box, MenuItem, TextField, Typography } from '@mui/material'
import type { SystemStyleObject, Theme } from '@mui/system'

import EntityTable from '@/components/common/EntityTable'
import type { ColumnConfig } from '@/components/common/EntityTable'
import PageSection from '@/components/common/PageSection'
import type { Account, AccountType } from '@/types'

import SettingsTableFrame from './SettingsTableFrame'

export interface FormValues {
  cashAccountId: string
  bankAccountId: string
  inventoryAccountId: string
  supplierDepositAccountId: string
  customerDepositAccountId: string
  openingBalanceEquityAccountId: string
  ownerCapitalAccountId: string
  ownerDrawingsAccountId: string
  salesRevenueAccountId: string
  cogsAccountId: string
  defaultExpenseAccountId: string
}

export interface SectionField {
  name: keyof FormValues
  label: string
  accountType: AccountType
}

export const PAYMENT_FIELDS: SectionField[] = [
  { name: 'cashAccountId', label: 'Cash Account', accountType: 'Asset' },
  { name: 'bankAccountId', label: 'Bank Account', accountType: 'Asset' },
]

export const SALES_FIELDS: SectionField[] = [
  { name: 'customerDepositAccountId', label: 'Customer Deposit Account', accountType: 'Liability' },
  { name: 'salesRevenueAccountId', label: 'Sales Revenue Account', accountType: 'Income' },
]

export const INVENTORY_PURCHASING_FIELDS: SectionField[] = [
  { name: 'inventoryAccountId', label: 'Inventory Account', accountType: 'Asset' },
  { name: 'supplierDepositAccountId', label: 'Supplier Deposit Account', accountType: 'Asset' },
]

/*
 * The two Expense-type accounts, together.
 *
 * They are the pair the Form B section below cares about, and the distinction
 * between them is what the Form B mapping rules turn on: COGS (and everything
 * beneath it) is EXCLUDED from expense mapping because it already reaches Form
 * B through N7, while Default Expense is an ordinary mappable expense. Showing
 * them side by side is what makes that exclusion legible.
 *
 * Consumers: cogsAccountId is read on sales/delivery posting;
 * defaultExpenseAccountId only by postStockAdjustment(), for the expense leg of
 * a stock write-off (accounting-posting.service.ts).
 */
export const EXPENSE_FIELDS: SectionField[] = [
  { name: 'cogsAccountId', label: 'COGS Account', accountType: 'Expense' },
  { name: 'defaultExpenseAccountId', label: 'Default Expense Account', accountType: 'Expense' },
]

// Consumed only by the Owner Equity module's postings — capital injections,
// cash/stock drawings, and their refunds.
export const OWNER_EQUITY_FIELDS: SectionField[] = [
  { name: 'ownerCapitalAccountId', label: 'Owner Capital Account', accountType: 'Equity' },
  { name: 'ownerDrawingsAccountId', label: 'Owner Drawings Account', accountType: 'Equity' },
]

/*
 * One field on purpose. Opening Balance Equity is used by exactly one posting
 * path — postOpeningBalance(), when an account's opening balance is set — which
 * is a distinct, infrequent setup step rather than day-to-day operation.
 *
 * The section it replaces was "System": a leftover bucket holding three Equity
 * accounts and one Expense account, named after no concept any of them shared.
 */
export const SETUP_FIELDS: SectionField[] = [
  { name: 'openingBalanceEquityAccountId', label: 'Opening Balance Equity Account', accountType: 'Equity' },
]

/*
 * One table, two kinds of row.
 *
 * A `section` row is a full-width group band (Payment, Sales, ...); a `field`
 * row is one setting. Keeping both in ONE EntityTable is what lets this
 * section match FormBMappingSection structurally — one heading, one card, one
 * table — while preserving the six categories #1182 requires.
 *
 * This mirrors FormBTaxView, which discriminates on `kind` and styles the band
 * through getRowSx rather than a colspan. EntityTable renders every column for
 * every row, so a band puts its label in the first cell and leaves the rest
 * empty; the background, rules and tracking are what make it read as a break.
 */
type FieldRow =
  | ({ kind: 'field'; id: string } & SectionField)
  | { kind: 'section'; id: string; label: string }

/**
 * Rows are inert: the interaction lives in the Select inside the cell, not in
 * the row. `isRowSelectable` returning false is what makes that explicit — a
 * no-op `onSelect` would leave a dead click target that still looks clickable.
 */
const isFieldRowSelectable = () => false

/*
 * The band's styling, lifted from FormBTaxView's `section` rows so the two
 * accounting tables break their groups the same way. A font-weight change
 * alone does not read as a break — the background, uppercase tracking and
 * rules above and below give the eye something to catch when scanning.
 */
const rowSxFor = (row: FieldRow, isFirst: boolean): SystemStyleObject<Theme> =>
  row.kind === 'section'
    ? {
        backgroundColor: 'action.hover',
        '& td': {
          fontWeight: 700,
          fontSize: '0.8125rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'text.primary',
          /*
           * A top rule ONLY. The preceding row already draws its own bottom
           * border, so a `borderTop` here stacks against it and renders as a
           * double line — visible between Bank Account and the SALES band.
           *
           * FormBTaxView uses both rules because its bands separate dense
           * numeric blocks; these groups are one or two rows each, where the
           * background tint and uppercase tracking already do the separating
           * and a second rule just adds weight.
           */
          // The FIRST band needs no top rule either: the table's own top edge
          // is directly above it, and a rule there doubles against it.
          borderTop: isFirst ? 'none' : 2,
          borderTopColor: 'divider',
          borderBottom: 'none',
          pt: 1.25,
          pb: 1.25,
          whiteSpace: 'nowrap',
        },
      }
    : {}

const SECTIONS: { label: string; fields: SectionField[] }[] = [
  { label: 'Payment', fields: PAYMENT_FIELDS },
  { label: 'Sales', fields: SALES_FIELDS },
  { label: 'Inventory & Purchasing', fields: INVENTORY_PURCHASING_FIELDS },
  { label: 'Expenses', fields: EXPENSE_FIELDS },
  { label: 'Owner Equity', fields: OWNER_EQUITY_FIELDS },
  { label: 'Setup', fields: SETUP_FIELDS },
]

export default function DefaultAccountsSection({
  accounts, control, errors, disabled,
}: {
  accounts: Account[]
  control: Control<FormValues>
  errors: Record<string, any>
  disabled: boolean
}) {
  // Flatten the six groups into one row list: a band, then its fields.
  const rows: FieldRow[] = SECTIONS.flatMap(({ label, fields }) => [
    { kind: 'section' as const, id: `section-${label}`, label },
    ...fields.map((f) => ({ kind: 'field' as const, id: f.name, ...f })),
  ])

  /*
   * `raw` on every column whose renderer emits anything but plain inline text.
   * Without it EntityTable wraps the cell in a <Typography variant="body2">,
   * which renders a <p> — so a Select or nested Typography lands inside a
   * paragraph. Invalid HTML, and React warns about it.
   */
  const columns: ColumnConfig<FieldRow>[] = [
    {
      key: 'setting',
      raw: true,
      render: (row) => <Typography variant="body2">{row.label}</Typography>,
    },
    {
      key: 'accountType',
      width: 140,
      raw: true,
      // The filter that decides this field's options, made visible. A band row
      // has no account type, so it renders nothing here.
      render: (row) =>
        row.kind === 'section' ? null : (
          <Typography variant="body2" color="text.secondary">
            {row.accountType}
          </Typography>
        ),
    },
    {
      key: 'account',
      // Matches FormBMappingSection's `mapping` column width so the control
      // columns of both sections line up down the page. Left-aligned in both:
      // a right-aligned dropdown pushes its label away from the row it belongs
      // to, and the two sections must agree.
      width: 280,
      raw: true,
      render: (row) => {
        if (row.kind === 'section') return null
        const filtered = accounts.filter((a) => a.type === row.accountType)
        return (
          <Controller
            name={row.name}
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                select
                size="small"
                fullWidth
                disabled={disabled}
                error={!!errors[row.name]}
                helperText={errors[row.name]?.message || ''}
                slotProps={{ htmlInput: { 'aria-label': row.label }, select: { 'aria-label': row.label } } as any}
              >
                <MenuItem value="">
                  <em>Select {row.label}</em>
                </MenuItem>
                {filtered.map((account) => (
                  <MenuItem key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        )
      },
    },
  ]

  return (
    <PageSection label="Default Accounts">
      {/* The same `p: 2` inset FormBMappingSection puts inside its PageSection. */}
      <Box sx={{ p: 2 }}>
        <SettingsTableFrame>
          <EntityTable
            rows={rows}
            columns={columns}
            headers={['Setting', 'Account Type', 'Account']}
            showHeader={false}
            isRowSelectable={isFieldRowSelectable}
            onSelect={() => {}}
            getRowSx={(row) => rowSxFor(row, row.id === rows[0].id)}
            focusedIndex={-1}
            listRef={{ current: null } as any}
            loading={false}
            total={rows.length}
            label="Default accounts"
            emptyLabel="settings"
          />
        </SettingsTableFrame>
      </Box>
    </PageSection>
  )
}
