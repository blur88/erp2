import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Link,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

import EntityTable from '@/components/common/EntityTable'
import type { ColumnConfig } from '@/components/common/EntityTable'
import PageSection from '@/components/common/PageSection'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { useNotification } from '@/hooks/useNotification'
import { useGetFormBMappingsQuery, useUpdateFormBMappingMutation } from '@/store/api/accountingApi'
import type { FormBMappingRow } from '@/types'

import {
  FALLBACK_LINE,
  categoryOptionFor,
  optionsForType,
  reasonText,
} from './formBMappingMeta'

const UNMAPPED = '__unmapped__'

const TYPE_ORDER: Record<string, number> = { Expense: 0, Income: 1 }

interface TableRow extends FormBMappingRow {
  id: string
}

/**
 * Rows are inert: the interaction lives in the Select inside the cell, not in
 * the row. `isRowSelectable` returning false is what makes that explicit — a
 * no-op `onSelect` would leave a dead click target that still looks clickable.
 */
const isMappingRowSelectable = () => false

function MappingControl({
  row,
  isAdmin,
  onAssign,
  pending,
}: {
  row: TableRow
  isAdmin: boolean
  onAssign: (row: TableRow, category: string | null) => void
  pending: boolean
}) {
  const options = optionsForType(row.type)
  // Writes are @Auth(UserRole.ADMIN) server-side; a non-admin must not be able
  // to compose a change that can only 403.
  const canEdit = row.eligibility.eligible && isAdmin

  if (!canEdit) {
    /*
     * An ineligible row keeps a Clear affordance and nothing else. It is listed
     * PRECISELY so a stranded or invalid mapping can be removed — the one write
     * the backend still accepts on an ineligible account (setCategory nulls both
     * columns without an eligibility check).
     */
    return (
      <Button
        data-testid={`formb-map-clear-${row.accountId}`}
        size="small"
        onClick={() => onAssign(row, null)}
        disabled={!isAdmin || pending || row.category === null}
      >
        Clear
      </Button>
    )
  }

  return (
    <Select
      data-testid={`formb-map-select-${row.accountId}`}
      size="small"
      /*
       * Driven straight from `row.category` — the server's value. This component
       * holds NO local selection state, so a rejected write cannot leave a
       * chosen-but-unsaved value on screen looking saved.
       */
      value={row.category ?? UNMAPPED}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as string
        onAssign(row, next === UNMAPPED ? null : next)
      }}
      sx={{ minWidth: 240 }}
      inputProps={{ 'aria-label': `Form B category for ${row.code} ${row.name}` }}
    >
      <MenuItem value={UNMAPPED}>
        <em>Unmapped</em>
      </MenuItem>
      {options.map((opt) => (
        <MenuItem key={opt.value} value={opt.value}>
          {opt.line} — {opt.label}
        </MenuItem>
      ))}
    </Select>
  )
}

/**
 * What this account currently contributes to, in words.
 *
 * An unmapped-but-eligible account is NOT blank: the report falls it back to
 * N24 / N13 automatically. An empty cell invites the reader to believe the
 * account is excluded; a cell identical to an explicit mapping invites the
 * opposite error — that someone chose it. It is therefore labelled "Automatic"
 * and distinguished by text, not by styling alone.
 */
function LineCell({ row }: { row: TableRow }) {
  const explicit = categoryOptionFor(row.type, row.category)

  if (explicit) {
    return (
      <Typography variant="body2" data-testid={`formb-map-line-${row.accountId}`}>
        {explicit.line} — {explicit.label}
      </Typography>
    )
  }

  if (row.category !== null) {
    // A category stored on an account whose type cannot express it. Show the raw
    // value rather than hiding it: this row exists to be repaired.
    return (
      <Typography
        variant="body2"
        color="error.main"
        data-testid={`formb-map-line-${row.accountId}`}
      >
        {row.category} (not valid for {row.type})
      </Typography>
    )
  }

  const fallback = FALLBACK_LINE[row.type]
  if (!fallback || !row.eligibility.eligible) {
    return (
      <Typography
        variant="body2"
        color="text.disabled"
        data-testid={`formb-map-line-${row.accountId}`}
      >
        Not included
      </Typography>
    )
  }

  return (
    <Box data-testid={`formb-map-line-${row.accountId}`}>
      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
        Automatic — {fallback.line} {fallback.label}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        No mapping saved; unmapped accounts fall here automatically.
      </Typography>
    </Box>
  )
}

export default function FormBMappingSection({ isAdmin = true }: { isAdmin?: boolean }) {
  const { data: rows = [], isLoading, isError } = useGetFormBMappingsQuery()
  const [updateMapping, { isError: isSaveError, error: saveError }] = useUpdateFormBMappingMutation()
  const { showSuccess } = useNotification()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const handleAssign = async (row: TableRow, category: string | null) => {
    setPendingId(row.accountId)
    try {
      await updateMapping({ accountId: row.accountId, category: category as any }).unwrap()
      showSuccess(
        category === null
          ? `Cleared the Form B mapping for ${row.code}.`
          : `Saved the Form B mapping for ${row.code}.`,
      )
    } catch {
      /*
       * Swallowed deliberately: the Alert below renders from the mutation's own
       * error state, and the Select needs no repair because it never left the
       * persisted value — it renders `row.category` and this component keeps no
       * local selection. Note invalidatesTags does NOT run on a rejected
       * mutation, so relying on invalidation to restore the row would not work.
       */
    } finally {
      setPendingId(null)
    }
  }

  const intro = (
    <Stack spacing={1} sx={{ mb: 2 }}>
      <Typography variant="body2" color="text.secondary">
        These mappings decide which Form B statutory line each Chart of Accounts
        account contributes to. They feed the Profit &amp; Loss lines{' '}
        <strong>N3–N27</strong>; the lines you can assign directly are{' '}
        <strong>N9–N13</strong> (income) and <strong>N15–N24</strong> (expenses).
        The remaining lines in that span are computed from those, from inventory,
        or entered when filing.
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Balance Sheet lines <strong>N28–N50</strong> are not configured here.
        Cost of Sales accounts are excluded on purpose — they already reach Form B
        through <strong>N7</strong>, so mapping them again would count them twice.
      </Typography>
      <Typography variant="body2" color="text.secondary" data-testid="formb-identity-note">
        The business name and registration number printed on Form B come from{' '}
        <Link component={RouterLink} to="/settings/company">
          Company Settings
        </Link>
        . They are not configured here, so the two cannot disagree.
      </Typography>
    </Stack>
  )

  if (isLoading) {
    return (
      <PageSection label="Form B Account Mapping">
        <Box sx={{ p: 2 }}>
          {intro}
          <ListSkeleton rows={6} columns={4} />
        </Box>
      </PageSection>
    )
  }

  /*
   * A failed load must not render as "No mappable accounts": that is the exact
   * text a successful empty response produces, so the user would read a server
   * error as a configuration fact and never retry.
   */
  if (isError) {
    return (
      <PageSection label="Form B Account Mapping">
        <Box sx={{ p: 2 }}>
          {intro}
          <Alert severity="error" data-testid="formb-mapping-error">
            Unable to load Form B account mappings. Please try again.
          </Alert>
        </Box>
      </PageSection>
    )
  }

  // Expense first, then Income, then anything stranded — within each, by code.
  // The old grouping survives as row ORDER plus the Type column, so the table
  // keeps one scroller and one header row across the whole list.
  const tableRows: TableRow[] = [...rows]
    .map((r) => ({ ...r, id: r.accountId }))
    .sort((a, b) => {
      const ta = TYPE_ORDER[a.type] ?? 2
      const tb = TYPE_ORDER[b.type] ?? 2
      if (ta !== tb) return ta - tb
      return a.code.localeCompare(b.code)
    })

  const columns: ColumnConfig<TableRow>[] = [
    {
      key: 'code',
      width: 110,
      render: (row) => (
        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {row.code}
        </Typography>
      ),
    },
    {
      key: 'name',
      render: (row) => (
        <Box
          data-testid={`formb-map-row-${row.accountId}`}
          sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2">{row.name}</Typography>
            {!row.isActive && <Chip label="inactive" size="small" />}
          </Box>
          {!row.eligibility.eligible && (
            <Typography variant="caption" color="text.secondary">
              {reasonText((row.eligibility as any).reason)}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      key: 'type',
      width: 110,
      render: (row) => (
        <Typography variant="body2" color="text.secondary">
          {row.type}
        </Typography>
      ),
    },
    {
      key: 'line',
      width: 260,
      render: (row) => <LineCell row={row} />,
    },
    {
      key: 'mapping',
      width: 280,
      align: 'right',
      render: (row) => (
        <MappingControl
          row={row}
          isAdmin={isAdmin}
          onAssign={handleAssign}
          pending={pendingId === row.accountId}
        />
      ),
    },
  ]

  return (
    <PageSection label="Form B Account Mapping">
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {intro}

        {/*
          A rejected write (an ineligible assignment, or a lost admin session)
          previously just closed the control, leaving the old value on screen as
          though the change had been saved.
        */}
        {isSaveError && (
          <Alert severity="error" data-testid="formb-mapping-save-error">
            {(saveError as any)?.data?.message ??
              'Unable to save the mapping. Please try again.'}
          </Alert>
        )}

        {!isAdmin && (
          <Alert severity="info" data-testid="formb-mapping-readonly">
            Form B mappings are read-only for your role. Only an administrator can
            change them.
          </Alert>
        )}

        {/*
          `showHeader` is off and there is no second PageSection: EntityTable
          renders its own <Paper> with its own header bar, so either would stack
          two cards and two titles. The PageSection above owns the heading.

          The height override matters. EntityTable's card is `height: 100%` +
          `overflow: hidden`, correct inside a bounded flex pane and collapsing
          to nothing inside GenericOverviewPage's document-flow scroll.
        */}
        <Box
          sx={{
            '& .entity-table-card': { height: 'auto', boxShadow: 'none' },
            '& .entity-table-frame': { overflow: 'visible' },
            '& .entity-table-scroller': { overflow: 'auto' },
          }}
        >
          <EntityTable
            rows={tableRows}
            columns={columns}
            headers={['Code', 'Account', 'Type', 'Form B Line', 'Mapping']}
            showHeader={false}
            isRowSelectable={isMappingRowSelectable}
            onSelect={() => {}}
            focusedIndex={-1}
            listRef={{ current: null } as any}
            loading={false}
            total={tableRows.length}
            label="Form B mappings"
            // Interpolated by EntityTable as `No ${emptyLabel} found`, so this
            // is a noun phrase, not a sentence.
            emptyLabel="mappable accounts"
          />
        </Box>
      </Box>
    </PageSection>
  )
}
