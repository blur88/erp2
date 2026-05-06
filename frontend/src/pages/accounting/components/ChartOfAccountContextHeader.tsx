import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import {
  Box,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { ChartOfAccount } from '@/types'
import { formatDate } from '@/utils/formatters'

import { ACCOUNT_TYPE_COLORS } from '../utils/accountTypeColors'

interface Props {
  selected: ChartOfAccount | null
  onEdit: () => void
  onDelete: () => void
}

const detailTableSx = {
  tableLayout: 'fixed',
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const labelCellSx = {
  fontWeight: 600,
  color: 'text.secondary',
  fontSize: '0.8rem',
}

const valueCellSx = {
  fontSize: '0.8rem',
}

export function ChartOfAccountContextHeader({ selected, onEdit, onDelete }: Props) {
  if (!selected) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select an account to view details
        </Typography>
      </Paper>
    )
  }

  const parentName = selected.parent?.name ?? '—'

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={`${selected.code} — ${selected.name}`}
        actions={(
          <Stack direction="row" spacing={0.5}>
            <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
              Edit
            </AppButton>
            <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>
              Delete
            </AppButton>
          </Stack>
        )}
      />

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{
                        pb: TABLE_STYLES.cell.padding.py * 0.67,
                        py: TABLE_STYLES.cell.padding.py * 0.67,
                        borderTop: TABLE_STYLES.cell.border,
                      }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Account Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Code</TableCell>
                    <TableCell sx={valueCellSx}>{selected.code}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Name</TableCell>
                    <TableCell sx={valueCellSx}>{selected.name}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Account Type</TableCell>
                    <TableCell sx={{ ...valueCellSx, color: `${ACCOUNT_TYPE_COLORS[selected.type]}.main` }}>
                      {selected.type.charAt(0) + selected.type.slice(1).toLowerCase()}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Parent Account</TableCell>
                    <TableCell sx={valueCellSx}>{parentName}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Cash Equivalent</TableCell>
                    <TableCell sx={valueCellSx}>{selected.isCashEquivalent ? 'Yes' : 'No'}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{
                        pb: TABLE_STYLES.cell.padding.py * 0.67,
                        py: TABLE_STYLES.cell.padding.py * 0.67,
                        borderTop: TABLE_STYLES.cell.border,
                      }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Status & Dates
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Status</TableCell>
                    <TableCell sx={{ ...valueCellSx, color: selected.isActive ? 'success.main' : 'text.disabled' }}>
                      {selected.isActive ? 'Active' : 'Inactive'}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Last Updated</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selected.updatedAt)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Created</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selected.createdAt)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}
