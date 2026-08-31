import { useState } from 'react'
import { Box, Button, Chip, Typography } from '@mui/material'

import PageSection from '@/components/common/PageSection'
import { useGetFormBMappingsQuery, useUpdateFormBMappingMutation } from '@/store/api/accountingApi'
import type { FormBMappingRow } from '@/types'

const EXPENSE_CATEGORY_OPTIONS: Array<{ value: string; line: string; label: string }> = [
  { value: 'LOAN_INTEREST', line: 'N15', label: 'Loan Interest' },
  { value: 'SALARIES_AND_WAGES', line: 'N16', label: 'Salaries and Wages' },
  { value: 'RENT_LEASE', line: 'N17', label: 'Rent / Lease' },
  { value: 'CONTRACT_SUBCONTRACT', line: 'N18', label: 'Contract and Subcontract' },
  { value: 'COMMISSION', line: 'N19', label: 'Commission' },
  { value: 'BAD_DEBTS', line: 'N20', label: 'Bad Debts' },
  { value: 'TRAVEL_TRANSPORT', line: 'N21', label: 'Travel and Transportation' },
  { value: 'REPAIRS_MAINTENANCE', line: 'N22', label: 'Repairs and Maintenance' },
  { value: 'PROMOTION_ADVERTISING', line: 'N23', label: 'Promotion and Advertising' },
  { value: 'OTHER_EXPENSES', line: 'N24', label: 'Other Expenses' },
]

const INCOME_CATEGORY_OPTIONS: Array<{ value: string; line: string; label: string }> = [
  { value: 'OTHER_BUSINESS', line: 'N9', label: 'Other Business' },
  { value: 'DIVIDENDS', line: 'N10', label: 'Dividends' },
  { value: 'INTEREST_AND_DISCOUNTS', line: 'N11', label: 'Interest and Discounts' },
  { value: 'RENT_ROYALTIES_PREMIUMS', line: 'N12', label: 'Rent, Royalties and Premiums' },
  { value: 'OTHER_INCOME', line: 'N13', label: 'Other Income' },
]

function optionsForType(type: string) {
  if (type === 'Expense') return EXPENSE_CATEGORY_OPTIONS
  if (type === 'Income') return INCOME_CATEGORY_OPTIONS
  return []
}

function Row({ row, onUpdate }: { row: FormBMappingRow; onUpdate: ReturnType<typeof useUpdateFormBMappingMutation>[0] }) {
  const isEligible = row.eligibility.eligible
  const familyOptions = optionsForType(row.type)
  const [open, setOpen] = useState(false)

  const handleSelect = (value: string) => {
    const category = value === '' ? null : value
    onUpdate({ accountId: row.accountId, category: category as any })
    setOpen(false)
  }

  const handleClear = () => {
    onUpdate({ accountId: row.accountId, category: null })
  }

  const selectedLabel = row.category
    ? (() => {
        const opt = familyOptions.find((o) => o.value === row.category)
        return opt ? `${opt.line} ${opt.label}` : row.category
      })()
    : 'Select category'

  return (
    <Box
      data-testid={`formb-map-row-${row.accountId}`}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        py: 1,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ minWidth: 60 }}>
          {row.code}
        </Typography>
        <Typography variant="body2" sx={{ flex: 1, wordBreak: 'break-word' }}>
          {row.name}
        </Typography>
        {!row.isActive && <Chip label="inactive" size="small" />}
        {!isEligible && (row.eligibility as any).reason && (
          <Typography variant="caption" color="text.secondary">
            {(row.eligibility as any).reason}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, position: 'relative' }}>
        {isEligible ? (
          <>
            <Box sx={{ position: 'relative' }}>
              <Button
                data-testid={`formb-map-select-${row.accountId}`}
                variant="outlined"
                size="small"
                onClick={() => setOpen((v) => !v)}
                sx={{ minWidth: 180, justifyContent: 'flex-start' }}
              >
                {selectedLabel}
              </Button>
              {open && (
                <Box
                  role="listbox"
                  sx={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    mt: 0.5,
                    minWidth: 220,
                    maxHeight: 240,
                    overflow: 'auto',
                    bgcolor: 'background.paper',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    boxShadow: 2,
                    zIndex: 10,
                  }}
                >
                  <Box
                    role="option"
                    onClick={() => handleSelect('')}
                    sx={{ p: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                  >
                    Unmapped
                  </Box>
                  {familyOptions.map((opt) => (
                    <Box
                      key={opt.value}
                      role="option"
                      onClick={() => handleSelect(opt.value)}
                      sx={{ p: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                    >
                      {opt.line} {opt.label}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
            {row.category !== null && (
              <Button
                data-testid={`formb-map-clear-${row.accountId}`}
                size="small"
                onClick={handleClear}
              >
                Clear
              </Button>
            )}
          </>
        ) : (
          <Button
            data-testid={`formb-map-clear-${row.accountId}`}
            size="small"
            onClick={handleClear}
          >
            Clear
          </Button>
        )}
      </Box>
    </Box>
  )
}

export default function FormBMappingSection() {
  const { data: rows = [], isLoading } = useGetFormBMappingsQuery()
  const [updateMapping] = useUpdateFormBMappingMutation()

  if (isLoading) {
    return (
      <PageSection label="Form B Account Mapping">
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Loading...
          </Typography>
        </Box>
      </PageSection>
    )
  }

  const expenseRows = rows.filter((r) => r.type === 'Expense')
  const incomeRows = rows.filter((r) => r.type === 'Income')
  // Any other types that are mapped but not Expense/Income (stranded mappings) surface separately
  const otherRows = rows.filter((r) => r.type !== 'Expense' && r.type !== 'Income')

  const groups: Array<{ label: string; rows: FormBMappingRow[] }> = []
  if (expenseRows.length) groups.push({ label: 'Expense', rows: expenseRows })
  if (incomeRows.length) groups.push({ label: 'Income', rows: incomeRows })
  if (otherRows.length) groups.push({ label: 'Other', rows: otherRows })

  return (
    <PageSection label="Form B Account Mapping">
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {groups.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No mappable accounts.
          </Typography>
        ) : (
          groups.map((group) => (
            <Box key={group.label}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                {group.label}
              </Typography>
              <Box>
                {group.rows.map((row) => (
                  <Row key={row.accountId} row={row} onUpdate={updateMapping} />
                ))}
              </Box>
            </Box>
          ))
        )}
      </Box>
    </PageSection>
  )
}
