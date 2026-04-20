import { Box, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { ChartOfAccount } from '@/types'
import { formatDate } from '@/utils/formatters'

interface Props {
  selected: ChartOfAccount | null
  allAccounts: ChartOfAccount[]
}

const labelSx = {
  border: 'none',
  py: TABLE_STYLES.cell.padding.py,
  px: TABLE_STYLES.cell.padding.px,
  color: 'text.secondary',
  width: '40%',
  fontWeight: 600,
  fontSize: '0.8rem',
}

const valueSx = {
  border: 'none',
  py: TABLE_STYLES.cell.padding.py,
  px: TABLE_STYLES.cell.padding.px,
  fontSize: '0.8rem',
}

const rows: { label: string; getValue: (account: ChartOfAccount, allAccounts: ChartOfAccount[]) => string }[] = [
  {
    label: 'Account Type',
    getValue: (account) => account.type.charAt(0) + account.type.slice(1).toLowerCase(),
  },
  {
    label: 'Parent Account',
    getValue: (account, allAccounts) =>
      account.parentId ? allAccounts.find((item) => item.id === account.parentId)?.name ?? '—' : '—',
  },
  { label: 'Description', getValue: (account) => account.description || '—' },
  {
    label: 'Balance',
    getValue: (account) => (account.currentBalance != null ? String(account.currentBalance) : '—'),
  },
  { label: 'Cash Equivalent', getValue: (account) => (account.isCashEquivalent ? 'Yes' : 'No') },
  { label: 'Created', getValue: (account) => formatDate(account.createdAt) },
  { label: 'Updated', getValue: (account) => formatDate(account.updatedAt) },
]

export function ChartOfAccountWorkspaceCard({ selected, allAccounts }: Props) {
  if (!selected) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1 }}>
      <Box sx={{ px: TABLE_STYLES.cell.padding.px, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          Details
        </Typography>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { border: 'none' } }}>
        <TableBody>
          {rows.map(({ label, getValue }, index) => (
            <TableRow key={label} sx={index % 2 === 1 ? { backgroundColor: 'grey.50' } : {}}>
              <TableCell sx={labelSx}>{label}</TableCell>
              <TableCell sx={valueSx}>{getValue(selected, allAccounts)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  )
}
