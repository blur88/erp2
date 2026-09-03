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
import EditIcon from '@mui/icons-material/Edit'
import { Link as RouterLink } from 'react-router-dom'

import EntityTable from '@/components/common/EntityTable'
import type { ColumnConfig } from '@/components/common/EntityTable'
import PageSection from '@/components/common/PageSection'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { useGetFormBMappingsQuery } from '@/store/api/accountingApi'
import type { FormBMappingRow, FormBCategory } from '@/types'

import SettingsTableFrame from './SettingsTableFrame'
import type { useFormBMappingDraft } from './useFormBMappingDraft'

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

/**
 * The words describing what a category value means for this row — the shared
 * renderer behind BOTH the persisted line and the pending one.
 *
 * Sharing it is what stops a pending clear rendering as "Pending: null": a
 * cleared mapping is described the same way the persisted column would
 * describe it, as the automatic fallback or as "Not included".
 */
function describeLine(row: TableRow, category: FormBCategory | null): string {
  const explicit = categoryOptionFor(row.type, category)
  if (explicit) return `${explicit.line} — ${explicit.label}`
  if (category !== null) return `${category} (not valid for ${row.type})`

  const fallback = FALLBACK_LINE[row.type]
  if (!fallback || !row.eligibility.eligible) return 'Not included'
  return `Automatic — ${fallback.line} ${fallback.label}`
}

function MappingControl({
  row,
  isAdmin,
  disabled,
  draft,
}: {
  row: TableRow
  isAdmin: boolean
  disabled?: boolean
  draft: ReturnType<typeof useFormBMappingDraft>
}) {
  const options = optionsForType(row.type)
  const draftValue = draft.valueFor(row)
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
    /*
     * The button TOGGLES once the clear is staged. Without this it disables
     * itself the moment it is clicked (draftValue becomes null), and the only
     * way to undo that one row is Cancel — which discards every other edit on
     * the page too.
     *
     * Undo restores the persisted category rather than a remembered draft:
     * `setMapping(id, row.category, row.category)` deletes the overlay key, so
     * the row goes back to genuinely clean rather than to an equal-but-dirty
     * value.
     */
    const staged = draft.isRowDirty(row.accountId)

    return (
      <Button
        data-testid={`formb-map-clear-${row.accountId}`}
        size="small"
        onClick={() =>
          staged
            ? draft.setMapping(row.accountId, row.category, row.category)
            : draft.setMapping(row.accountId, null, row.category)
        }
        disabled={!isAdmin || !!disabled || (!staged && draftValue === null)}
      >
        {staged ? 'Undo clear' : 'Clear'}
      </Button>
    )
  }

  return (
    <Select
      data-testid={`formb-map-select-${row.accountId}`}
      size="small"
      /*
       * Driven from the draft overlay, not straight from `row.category`.
       * This is what makes a staged edit visible before the page is saved.
       */
      value={draftValue ?? UNMAPPED}
      disabled={!!disabled}
      onChange={(e) => {
        const next = e.target.value as string
        draft.setMapping(row.accountId, next === UNMAPPED ? null : (next as FormBCategory), row.category)
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
function LineCell({ row, draft }: { row: TableRow; draft: ReturnType<typeof useFormBMappingDraft> }) {
  const explicit = categoryOptionFor(row.type, row.category)

  let persistedNode: React.ReactNode
  if (explicit) {
    persistedNode = (
      <Typography variant="body2" data-testid={`formb-map-line-${row.accountId}`}>
        {explicit.line} — {explicit.label}
      </Typography>
    )
  } else if (row.category !== null) {
    // A category stored on an account whose type cannot express it. Show the raw
    // value rather than hiding it: this row exists to be repaired.
    persistedNode = (
      <Typography
        variant="body2"
        color="error.main"
        data-testid={`formb-map-line-${row.accountId}`}
      >
        {row.category} (not valid for {row.type})
      </Typography>
    )
  } else {
    const fallback = FALLBACK_LINE[row.type]
    if (!fallback || !row.eligibility.eligible) {
      persistedNode = (
        <Typography
          variant="body2"
          color="text.disabled"
          data-testid={`formb-map-line-${row.accountId}`}
        >
          Not included
        </Typography>
      )
    } else {
      persistedNode = (
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
  }

  const isDirty = draft.isRowDirty(row.accountId)
  const draftValue = draft.valueFor(row)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {persistedNode}
      {isDirty && (
        <Typography
          variant="caption"
          color="warning.main"
          data-testid={`formb-map-pending-${row.accountId}`}
        >
          Pending: {describeLine(row, draftValue)}
        </Typography>
      )}
    </Box>
  )
}

export default function FormBMappingSection({
  isAdmin = true,
  disabled = false,
  draft,
  saveError,
}: {
  isAdmin?: boolean
  disabled?: boolean
  draft: ReturnType<typeof useFormBMappingDraft>
  saveError?: string | null
}) {
  const { data: rows = [], isLoading, isError } = useGetFormBMappingsQuery()

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

  /*
   * `raw` on every column whose renderer emits anything but plain inline text.
   * Without it EntityTable wraps the cell in a <Typography variant="body2">,
   * which renders a <p> — so a Box (<div>), a Select, or a nested Typography
   * lands inside a paragraph. That is invalid HTML and React warns about it.
   */
  const columns: ColumnConfig<TableRow>[] = [
    {
      key: 'code',
      width: 110,
      raw: true,
      render: (row) => (
        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {row.code}
        </Typography>
      ),
    },
    {
      key: 'name',
      raw: true,
      render: (row) => {
        const isDirty = draft.isRowDirty(row.accountId)
        return (
          <Box
            data-testid={`formb-map-row-${row.accountId}`}
            sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2">{row.name}</Typography>
              {isDirty && (
                <Chip
                  label="Changed"
                  size="small"
                  color="warning"
                  variant="outlined"
                  icon={<EditIcon fontSize="small" />}
                  data-testid={`formb-map-changed-${row.accountId}`}
                />
              )}
            </Box>
            {!row.eligibility.eligible && (
              <Typography variant="caption" color="text.secondary">
                {reasonText((row.eligibility as any).reason)}
              </Typography>
            )}
          </Box>
        )
      },
    },
    {
      key: 'type',
      width: 110,
      raw: true,
      render: (row) => (
        <Typography variant="body2" color="text.secondary">
          {row.type}
        </Typography>
      ),
    },
    {
      key: 'line',
      width: 260,
      raw: true,
      render: (row) => <LineCell row={row} draft={draft} />,
    },
    {
      key: 'mapping',
      width: 280,
      raw: true,
      render: (row) => (
        <MappingControl
          row={row}
          isAdmin={isAdmin}
          disabled={disabled}
          draft={draft}
        />
      ),
    },
  ]

  return (
    <PageSection label="Form B Account Mapping">
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {intro}

        {saveError && (
          <Alert severity="error" data-testid="formb-mapping-save-error">
            {saveError}
          </Alert>
        )}

        {!isAdmin && (
          <Alert severity="info" data-testid="formb-mapping-readonly">
            Form B mappings are read-only for your role. Only an administrator can
            change them.
          </Alert>
        )}

        <SettingsTableFrame>
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
            getRowSx={(row) =>
              draft.isRowDirty(row.accountId)
                ? { bgcolor: 'warning.light', opacity: 0.99 }
                : {}
            }
          />
        </SettingsTableFrame>
      </Box>
    </PageSection>
  )
}
