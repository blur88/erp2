import { Box, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { default as ClearIcon } from '@mui/icons-material/Clear'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as SettingsIcon } from '@mui/icons-material/Settings'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { MappingRow } from './AccountMappingsTable'

interface Props {
  row: MappingRow | null
  onConfigure: () => void
  onClear: () => void
}

const detailTableSx = {
  tableLayout: 'fixed' as const,
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const labelCellSx = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }
const valueCellSx = { fontSize: '0.8rem' }

const sectionHeaderSx = {
  fontWeight: 600,
  color: 'primary.main',
  fontSize: '0.8rem',
}

export function AccountMappingContextHeader({ row, onConfigure, onClear }: Props) {
  if (!row) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="body2" color="text.secondary">
          Select an account mapping to view details
        </Typography>
      </Paper>
    )
  }

  const isConfigured = !!row.mapping

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={row.label}
        actions={(
          <Stack direction="row" spacing={0.5}>
            <AppButton
              size="small"
              variant="outlined"
              startIcon={isConfigured ? <EditIcon /> : <SettingsIcon />}
              onClick={onConfigure}
            >
              {isConfigured ? 'Edit' : 'Configure'}
            </AppButton>
            {isConfigured && (
              <AppButton
                size="small"
                variant="warning"
                startIcon={<ClearIcon />}
                onClick={onClear}
              >
                Clear
              </AppButton>
            )}
          </Stack>
        )}
      />
      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Table size={TABLE_STYLES.size} sx={detailTableSx}>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={2} sx={{ py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                    <Typography sx={sectionHeaderSx}>Mapping Info</Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Name</TableCell>
                  <TableCell sx={valueCellSx}>{row.label}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Category</TableCell>
                  <TableCell sx={valueCellSx}>{row.category}</TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Description</TableCell>
                  <TableCell sx={valueCellSx}>{row.description}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Table size={TABLE_STYLES.size} sx={detailTableSx}>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={2} sx={{ py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                    <Typography sx={sectionHeaderSx}>Account Details</Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Account Code</TableCell>
                  <TableCell sx={valueCellSx}>
                    {row.mapping?.account?.code ?? (
                      <Typography component="span" sx={{ fontStyle: 'italic', color: 'text.secondary', fontSize: '0.8rem' }}>Not configured</Typography>
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Account Name</TableCell>
                  <TableCell sx={valueCellSx}>
                    {row.mapping?.account?.name ?? (
                      <Typography component="span" sx={{ fontStyle: 'italic', color: 'text.secondary', fontSize: '0.8rem' }}>-</Typography>
                    )}
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Account Type</TableCell>
                  <TableCell sx={valueCellSx}>
                    {row.mapping?.account?.accountType ?? (
                      <Typography component="span" sx={{ fontStyle: 'italic', color: 'text.secondary', fontSize: '0.8rem' }}>-</Typography>
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}
