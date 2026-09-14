import { Box, MenuItem, Select, Typography } from '@mui/material'

import EntityTable from '@/components/common/EntityTable'
import type { ColumnConfig } from '@/components/common/EntityTable'
import PageSection from '@/components/common/PageSection'
import type { Account, PaymentMethodMappingRow } from '@/types'

import SettingsTableFrame from './SettingsTableFrame'
import type { usePaymentMethodMappingDraft } from './usePaymentMethodMappingDraft'

const CHANNEL_DEFAULT = '__channel_default__'

interface TableRow extends PaymentMethodMappingRow {
  id: string
}

/**
 * Rows are inert: the interaction lives in the Select inside the cell, not in
 * the row. `isRowSelectable` returning false is what makes that explicit — a
 * no-op `onSelect` would leave a dead click target that still looks clickable.
 */
const isMappingRowSelectable = () => false

function AccountControl({
  row,
  accounts,
  draft,
  disabled,
}: {
  row: TableRow
  accounts: Account[]
  draft: ReturnType<typeof usePaymentMethodMappingDraft>
  disabled?: boolean
}) {
  const value = draft.valueFor(row)

  /*
   * An invalid mapped account is not in the active-postable option list, so it
   * is injected as a disabled extra option. Dropping it would hide the very
   * misconfiguration the flag points at: the select would read as unmapped
   * while the caption beside it says the row is mapped to something.
   *
   * When the GET could not read a code and name (a deleted or missing
   * account), the raw accountId is the only identifier left, so it is shown.
   */
  const mappedMissingFromOptions =
    row.status === 'invalid' &&
    row.accountId !== null &&
    !accounts.some((account) => account.id === row.accountId)
  const mappedLabel =
    row.accountCode && row.accountName
      ? `${row.accountCode} ${row.accountName}`
      : row.accountId

  return (
    <Box
      data-testid={`pm-map-account-${row.paymentMethodId}`}
      sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}
    >
      <Select
        data-testid={`pm-map-select-${row.paymentMethodId}`}
        size="small"
        /*
         * Driven from the draft overlay, not straight from `row.accountId`.
         * This is what makes a staged edit visible before the page is saved.
         */
        value={value ?? CHANNEL_DEFAULT}
        disabled={!!disabled}
        onChange={(e) => {
          const next = e.target.value as string
          // The blank option clears to null, never ''. @IsUUID rejects ''.
          draft.setMapping(
            row.paymentMethodId,
            next === CHANNEL_DEFAULT ? null : next,
            row.accountId,
          )
        }}
        sx={{ minWidth: 240 }}
        inputProps={{ 'aria-label': `Payment account for ${row.paymentMethodName}` }}
      >
        <MenuItem value={CHANNEL_DEFAULT}>
          <em>— use channel default —</em>
        </MenuItem>
        {accounts.map((account) => (
          <MenuItem key={account.id} value={account.id}>
            {account.code} {account.name}
          </MenuItem>
        ))}
        {mappedMissingFromOptions && (
          <MenuItem key="mapped-invalid" value={row.accountId as string} disabled>
            {mappedLabel}
          </MenuItem>
        )}
      </Select>

      {row.status === 'unmapped' && (
        <Typography
          variant="caption"
          color="text.secondary"
          data-testid={`pm-map-unmapped-${row.paymentMethodId}`}
        >
          No mapping — payments fall back to the{' '}
          {row.accountingChannel === 'CASH' ? 'cash' : 'bank'} channel default.
        </Typography>
      )}
      {row.status === 'invalid' && (
        <Typography
          variant="caption"
          color="error.main"
          data-testid={`pm-map-invalid-${row.paymentMethodId}`}
        >
          Mapped account is {row.invalidReason}.
        </Typography>
      )}
    </Box>
  )
}

export default function PaymentMethodMappingSection({
  rows,
  accounts,
  draft,
  disabled = false,
}: {
  rows: PaymentMethodMappingRow[]
  accounts: Account[]
  draft: ReturnType<typeof usePaymentMethodMappingDraft>
  disabled?: boolean
}) {
  const tableRows: TableRow[] = rows.map((row) => ({ ...row, id: row.paymentMethodId }))

  /*
   * `raw` on every column whose renderer emits anything but plain inline text.
   * Without it EntityTable wraps the cell in a <Typography variant="body2">,
   * which renders a <p> — so a Box (<div>), a Select, or a nested Typography
   * lands inside a paragraph. That is invalid HTML and React warns about it.
   */
  const columns: ColumnConfig<TableRow>[] = [
    {
      key: 'paymentMethod',
      width: 200,
      raw: true,
      render: (row) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <Typography variant="body2">{row.paymentMethodName}</Typography>
          <Typography variant="caption" color="text.secondary">
            {row.paymentMethodCode}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'channel',
      width: 140,
      raw: true,
      // Derived from the method, never chosen: a plain read-only cell, not a
      // control. It is what makes the fallback in play visible per row.
      render: (row) => (
        <Typography
          variant="body2"
          color="text.secondary"
          data-testid={`pm-map-channel-${row.paymentMethodId}`}
        >
          {row.accountingChannel}
        </Typography>
      ),
    },
    {
      key: 'account',
      width: 280,
      raw: true,
      render: (row) => (
        <AccountControl
          row={row}
          accounts={accounts}
          draft={draft}
          disabled={disabled}
        />
      ),
    },
  ]

  return (
    <PageSection label="Payment Method Mapping">
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Each active payment method posts into the account mapped here. A method
          with no mapping falls back to its channel default configured under
          Default Accounts — cash methods to the Cash Account, bank methods to
          the Bank Account.
        </Typography>

        <SettingsTableFrame>
          <EntityTable
            rows={tableRows}
            columns={columns}
            headers={['Payment Method', 'Accounting Channel', 'Account']}
            showHeader={false}
            isRowSelectable={isMappingRowSelectable}
            onSelect={() => {}}
            getRowProps={(row) => ({ 'data-testid': `pm-map-row-${row.paymentMethodId}` })}
            focusedIndex={-1}
            listRef={{ current: null } as any}
            loading={false}
            total={tableRows.length}
            label="Payment method mappings"
            // Interpolated by EntityTable as `No ${emptyLabel} found`, so this
            // is a noun phrase, not a sentence.
            emptyLabel="payment methods"
          />
        </SettingsTableFrame>
      </Box>
    </PageSection>
  )
}
