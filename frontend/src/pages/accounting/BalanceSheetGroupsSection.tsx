import { useState } from 'react'
import {
  Box,
  Button,
  Chip,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import CancelIcon from '@mui/icons-material/Cancel'

import PageSection from '@/components/common/PageSection'
import type { Account, BalanceSheetGroupName, BalanceSheetGroupRow } from '@/types'

import type { useBalanceSheetGroupsDraft } from './useBalanceSheetGroupsDraft'

interface GroupSpec {
  group: BalanceSheetGroupName
  line: string
  label: string
  help: string
}

/**
 * The two groups, and the ONE place their user-facing wording lives.
 *
 * The N39 help text is deliberately explicit about replacement: configuring the
 * group displaces the Supplier Deposit Account, and an operator who wants it to
 * keep contributing must select it here. Leaving that implicit is how a
 * supplier-deposit balance silently falls out of the official totals and
 * disqualifies the Balance Check.
 */
export const GROUP_SPECS: GroupSpec[] = [
  {
    group: 'BANK_BALANCE',
    line: 'N38',
    label: 'Bank Balance Accounts',
    help:
      'Every account selected here is reported under N38 Bank Balance. While this ' +
      'group is empty, N38 falls back to the single Bank Account configured above.',
  },
  {
    group: 'OTHER_CURRENT_ASSETS',
    line: 'N39',
    label: 'Other Current Assets Accounts',
    help:
      'Every account selected here is reported under N39 Other Current Assets. ' +
      'Configuring this group replaces the Supplier Deposit Account as N39’s ' +
      'contributor — select it here as well to keep it included. While the group ' +
      'is empty, N39 falls back to that account.',
  },
]

function GroupList({
  spec,
  accounts,
  rows,
  draft,
  disabled,
}: {
  spec: GroupSpec
  accounts: Account[]
  rows: BalanceSheetGroupRow[]
  draft: ReturnType<typeof useBalanceSheetGroupsDraft>
  disabled: boolean
}) {
  const [pending, setPending] = useState('')
  const memberIds = draft.accountsIn(spec.group)

  const byId = new Map(accounts.map((a) => [a.id, a]))
  // Server-side identity for an account that is no longer selectable (deleted,
  // deactivated), so a grouped-but-ineligible row can still be named and
  // removed rather than rendering as a bare uuid.
  const persistedById = new Map(rows.map((r) => [r.accountId, r]))

  /*
   * Only ungrouped accounts are offered. An account already in EITHER group is
   * excluded, which is the UI half of the database's one-group-per-account
   * rule — the backend still rejects a conflict, but the picker should not
   * invite one.
   */
  const available = accounts.filter((a) => !draft.assignments[a.id])

  const labelFor = (accountId: string) => {
    const account = byId.get(accountId)
    if (account) return `${account.code} ${account.name}`
    const row = persistedById.get(accountId)
    if (row?.accountCode && row?.accountName) return `${row.accountCode} ${row.accountName}`
    return accountId
  }

  const add = () => {
    if (!pending) return
    draft.setAssignment(pending, spec.group)
    setPending('')
  }

  return (
    <Box data-testid={`bsg-group-${spec.line}`} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="subtitle2">
        {spec.line} {spec.label}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {spec.help}
      </Typography>

      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: 'center', minHeight: 40 }}
        data-testid={`bsg-members-${spec.line}`}
      >
        {memberIds.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            data-testid={`bsg-empty-${spec.line}`}
          >
            No accounts selected — falling back to the default account.
          </Typography>
        )}
        {memberIds.map((accountId) => {
          const row = persistedById.get(accountId)
          const invalid = row?.status === 'invalid'
          return (
            <Chip
              key={accountId}
              data-testid={`bsg-chip-${accountId}`}
              label={
                invalid ? `${labelFor(accountId)} (${row?.invalidReason})` : labelFor(accountId)
              }
              color={invalid ? 'error' : 'default'}
              variant={invalid ? 'outlined' : 'filled'}
              /*
               * Chip's OWN delete affordance. `deleteIcon` customises the
               * element MUI already wires for click and keyboard; an
               * IconButton here would nest a button inside Chip's own
               * clickable slot, which is invalid HTML.
               *
               * MUI 9's Chip slotProps exposes only `root` and `label`, so the
               * accessible name and test hook go on the icon element itself.
               */
              onDelete={disabled ? undefined : () => draft.remove(accountId)}
              deleteIcon={
                <CancelIcon
                  aria-label={`Remove ${labelFor(accountId)} from ${spec.label}`}
                  data-testid={`bsg-remove-${accountId}`}
                />
              }
            />
          )
        })}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Select
          size="small"
          displayEmpty
          value={pending}
          disabled={disabled}
          onChange={(e) => setPending(e.target.value as string)}
          sx={{ minWidth: 260 }}
          inputProps={{ 'aria-label': `Add an account to ${spec.label}` }}
          data-testid={`bsg-select-${spec.line}`}
        >
          <MenuItem value="">
            <em>Select an account…</em>
          </MenuItem>
          {available.map((account) => (
            <MenuItem key={account.id} value={account.id}>
              {account.code} {account.name}
            </MenuItem>
          ))}
        </Select>
        <Button
          size="small"
          variant="outlined"
          onClick={add}
          disabled={disabled || !pending}
          data-testid={`bsg-add-${spec.line}`}
        >
          Add
        </Button>
      </Stack>
    </Box>
  )
}

export default function BalanceSheetGroupsSection({
  accounts,
  rows,
  draft,
  disabled = false,
}: {
  accounts: Account[]
  rows: BalanceSheetGroupRow[]
  draft: ReturnType<typeof useBalanceSheetGroupsDraft>
  disabled?: boolean
}) {
  /*
   * Only ASSET accounts are eligible, matching the backend rule. Filtering here
   * rather than at the query keeps the other sections' option lists intact —
   * they share the same `accounts` prop.
   */
  const assetAccounts = accounts.filter((a) => a.type === 'Asset')

  return (
    <PageSection label="Balance Sheet Grouping">
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Decides which accounts the Balance Sheet reports under N38 and N39.
          This is a reporting classification only — it does not change which
          account a payment posts into. An account may belong to one group at
          most.
        </Typography>

        {GROUP_SPECS.map((spec) => (
          <GroupList
            key={spec.group}
            spec={spec}
            accounts={assetAccounts}
            rows={rows}
            draft={draft}
            disabled={disabled}
          />
        ))}
      </Box>
    </PageSection>
  )
}
