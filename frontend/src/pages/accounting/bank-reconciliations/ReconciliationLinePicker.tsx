import React from 'react'
import {
  Box,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import ClearIcon from '@mui/icons-material/Clear'
import SearchIcon from '@mui/icons-material/Search'
import { Link as RouterLink } from 'react-router-dom'
import { Link as MuiLink } from '@mui/material'

import PagePagination from '@/components/common/PagePagination'
import SourceLink from '@/pages/accounting/components/SourceLink'
import type { AccountingSourceType, ReconciliationLineDto } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

export interface ReconciliationLinePickerProps {
  rows: ReconciliationLineDto[]
  total: number
  page: number
  search: string
  loading: boolean
  selectedIds: ReadonlySet<string>
  onToggle: (line: ReconciliationLineDto) => void
  onPageChange: (p: number) => void
  onSearchChange: (s: string) => void
  readOnly?: boolean
}

export default function ReconciliationLinePicker({
  rows,
  total,
  page,
  search,
  loading,
  selectedIds,
  onToggle,
  onPageChange,
  onSearchChange,
  readOnly = false,
}: ReconciliationLinePickerProps): React.ReactElement {
  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h6">Transactions</Typography>
          <TextField
            size="small"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label="Clear search"
                      onClick={() => onSearchChange('')}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              },
            }}
            sx={{ minWidth: 280 }}
          />
        </Box>

        <TableContainer sx={{ minHeight: 200, position: 'relative' }}>
          {loading && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.6)',
                zIndex: 1,
              }}
            >
              <CircularProgress size={32} />
            </Box>
          )}

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ width: 48 }}></TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Journal No</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Money In</TableCell>
                <TableCell align="right">Money Out</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    {loading ? 'Loading transactions...' : 'No transactions found.'}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const isChecked = selectedIds.has(row.journalEntryLineId)
                  return (
                    <TableRow
                      key={row.journalEntryLineId}
                      hover
                      onClick={() => !readOnly && onToggle(row)}
                      sx={{ cursor: readOnly ? 'default' : 'pointer' }}
                    >
                      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          size="small"
                          checked={isChecked}
                          disabled={readOnly}
                          onChange={() => onToggle(row)}
                        />
                      </TableCell>
                      <TableCell>{formatDate(row.entryDate)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <MuiLink
                          component={RouterLink}
                          to={`/accounting/journal-entries/${row.journalEntryId}`}
                          underline="hover"
                        >
                          {row.journalNo}
                        </MuiLink>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <SourceLink
                          sourceType={row.sourceType as AccountingSourceType}
                          sourceDocumentId={row.sourceDocumentId}
                          sourceRef={row.sourceRef}
                        />
                      </TableCell>
                      <TableCell>{row.description || '—'}</TableCell>
                      <TableCell align="right">{formatCurrency(row.moneyIn)}</TableCell>
                      <TableCell align="right">{formatCurrency(row.moneyOut)}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {total > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1 }}>
            <PagePagination
              total={total}
              page={page}
              limit={25}
              onPageChange={onPageChange}
              onLimitChange={() => {}}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  )
}
