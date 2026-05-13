import {
  Box,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

import { WorkspaceCardSectionHeader } from '@/components/common/WorkspaceCardSectionHeader'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetChartOfAccountRecentActivityQuery } from '@/store/api/accountingApi'
import type { ChartOfAccount } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

import { ACCOUNT_TYPE_COLORS } from '../utils/accountTypeColors'

interface Props {
  selected: ChartOfAccount | null
}

const thSx = {
  fontWeight: 600,
  fontSize: '0.75rem',
  color: 'text.secondary',
  py: TABLE_STYLES.cell.padding.py,
  px: TABLE_STYLES.cell.padding.px,
  borderBottom: TABLE_STYLES.cell.border,
}

const tdSx = {
  fontSize: '0.8rem',
  py: TABLE_STYLES.cell.padding.py,
  px: TABLE_STYLES.cell.padding.px,
  border: 'none',
}

function SubAccountsTable({ accounts }: { accounts: ChartOfAccount[] }) {
  if (accounts.length === 0) {
    return (
      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
          No sub-accounts.
        </Typography>
      </Box>
    )
  }

  return (
    <Table size={TABLE_STYLES.size}>
      <TableHead>
        <TableRow>
          <TableCell sx={thSx}>Code</TableCell>
          <TableCell sx={thSx}>Name</TableCell>
          <TableCell sx={thSx}>Type</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {accounts.map((child, index) => (
          <TableRow key={child.id} sx={index % 2 === 1 ? { backgroundColor: 'grey.50' } : {}}>
            <TableCell sx={tdSx}>{child.code}</TableCell>
            <TableCell sx={tdSx}>{child.name}</TableCell>
            <TableCell sx={{ ...tdSx, color: `${ACCOUNT_TYPE_COLORS[child.type]}.main` }}>
              {child.type.charAt(0) + child.type.slice(1).toLowerCase()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function RecentActivityTable({ accountId }: { accountId: string }) {
  const { data: activity = [], isLoading } = useGetChartOfAccountRecentActivityQuery(
    { id: accountId, limit: 10 },
  )

  if (isLoading) {
    return (
      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} variant="text" height={28} />
        ))}
      </Box>
    )
  }

  if (activity.length === 0) {
    return (
      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
          No recent activity.
        </Typography>
      </Box>
    )
  }

  return (
    <Table size={TABLE_STYLES.size}>
      <TableHead>
        <TableRow>
          <TableCell sx={thSx}>Date</TableCell>
          <TableCell sx={thSx}>Reference</TableCell>
          <TableCell sx={thSx}>Description</TableCell>
          <TableCell sx={{ ...thSx, textAlign: 'right' }}>Debit</TableCell>
          <TableCell sx={{ ...thSx, textAlign: 'right' }}>Credit</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {activity.map((item, index) => (
          <TableRow key={`${item.reference}-${index}`} sx={index % 2 === 1 ? { backgroundColor: 'grey.50' } : {}}>
            <TableCell sx={tdSx}>{formatDate(item.date)}</TableCell>
            <TableCell sx={tdSx}>{item.reference}</TableCell>
            <TableCell sx={{ ...tdSx, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.description}
            </TableCell>
            <TableCell sx={{ ...tdSx, textAlign: 'right' }}>
              {item.debit != null ? formatCurrency(item.debit) : '—'}
            </TableCell>
            <TableCell sx={{ ...tdSx, textAlign: 'right' }}>
              {item.credit != null ? formatCurrency(item.credit) : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function ChartOfAccountWorkspaceCard({ selected }: Props) {
  if (!selected) {
    return <Paper sx={{ flex: 1 }} />
  }

  const isHeader = (selected.children?.length ?? 0) > 0
  const sectionTitle = isHeader ? 'Sub-Accounts' : 'Recent Activity'

  return (
    <Paper sx={{ flex: 1 }}>
      <WorkspaceCardSectionHeader title={sectionTitle} />
      {isHeader ? (
        <SubAccountsTable accounts={selected.children ?? []} />
      ) : (
        <RecentActivityTable accountId={selected.id} />
      )}
    </Paper>
  )
}
