import React from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  InputAdornment,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import ClearIcon from '@mui/icons-material/Clear'
import SearchIcon from '@mui/icons-material/Search'
import { Link as RouterLink } from 'react-router-dom'
import { Link as MuiLink } from '@mui/material'

import PagePagination from '@/components/common/PagePagination'
import SourceLink from '@/pages/accounting/components/SourceLink'
import type {
  AccountingSourceType,
  ReconciliationLineDto,
  SetupClassification,
  SetupSummaryDto,
} from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

export interface SetupClassificationSectionProps {
  rows: ReconciliationLineDto[]
  total: number
  page: number
  search: string
  filter: SetupClassification | 'ALL'
  loading: boolean
  summary: SetupSummaryDto | null
  classificationOf: (id: string, saved: SetupClassification) => SetupClassification
  onClassify: (line: ReconciliationLineDto, next: 'CLEARED' | 'OUTSTANDING') => void
  onClear: (line: ReconciliationLineDto) => void
  onPageChange: (p: number) => void
  onSearchChange: (s: string) => void
  onFilterChange: (f: SetupClassification | 'ALL') => void
}

export default function SetupClassificationSection({
  rows,
  total,
  page,
  search,
  filter,
  loading,
  summary,
  classificationOf,
  onClassify,
  onClear,
  onPageChange,
  onSearchChange,
  onFilterChange,
}: SetupClassificationSectionProps): React.ReactElement {
  const unclassifiedCount = summary?.unclassifiedCount ?? 0
  const openingDiff = summary?.openingBalanceDifference ?? '0.00'

  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h6">First-time setup</Typography>
            <Typography variant="body2" color="text.secondary">
              Classify pre-period entries as already cleared or outstanding.
            </Typography>
            <Box sx={{ display: 'flex', gap: 3, mt: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {unclassifiedCount} unclassified
              </Typography>
              <Typography variant="body2">
                Opening Balance Difference: <strong>{formatCurrency(openingDiff)}</strong>
              </Typography>
            </Box>
          </Box>

          <TextField
            size="small"
            placeholder="Search setup entries..."
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
            sx={{ minWidth: 260 }}
          />
        </Box>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={filter}
            onChange={(_, val) => onFilterChange(val)}
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="All" value="ALL" />
            <Tab label="Unclassified" value="UNCLASSIFIED" />
            <Tab label="Already cleared" value="CLEARED" />
            <Tab label="Outstanding" value="OUTSTANDING" />
          </Tabs>
        </Box>

        <TableContainer sx={{ minHeight: 180, position: 'relative' }}>
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
                <TableCell>Date</TableCell>
                <TableCell>Journal No</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Money In</TableCell>
                <TableCell align="right">Money Out</TableCell>
                <TableCell align="center">Classification</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    {loading ? 'Loading entries...' : 'No setup entries found.'}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const saved = row.classification ?? 'UNCLASSIFIED'
                  const active = classificationOf(row.journalEntryLineId, saved)
                  return (
                    <TableRow key={row.journalEntryLineId} hover>
                      <TableCell>{formatDate(row.entryDate)}</TableCell>
                      <TableCell>
                        <MuiLink
                          component={RouterLink}
                          to={`/accounting/journal-entries/${row.journalEntryId}`}
                          underline="hover"
                        >
                          {row.journalNo}
                        </MuiLink>
                      </TableCell>
                      <TableCell>
                        <SourceLink
                          sourceType={row.sourceType as AccountingSourceType}
                          sourceDocumentId={row.sourceDocumentId}
                          sourceRef={row.sourceRef}
                        />
                      </TableCell>
                      <TableCell>{row.description || '—'}</TableCell>
                      <TableCell align="right">{formatCurrency(row.moneyIn)}</TableCell>
                      <TableCell align="right">{formatCurrency(row.moneyOut)}</TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                          <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={active === 'UNCLASSIFIED' ? null : active}
                          >
                            <ToggleButton
                              value="CLEARED"
                              aria-label="Already cleared"
                              aria-pressed={active === 'CLEARED'}
                              onClick={() => {
                                if (active === 'CLEARED') {
                                  onClear(row)
                                } else {
                                  onClassify(row, 'CLEARED')
                                }
                              }}
                              sx={{ px: 1.5, py: 0.5, fontSize: '0.75rem', textTransform: 'none' }}
                            >
                              Already cleared
                            </ToggleButton>
                            <ToggleButton
                              value="OUTSTANDING"
                              aria-label="Outstanding"
                              aria-pressed={active === 'OUTSTANDING'}
                              onClick={() => {
                                if (active === 'OUTSTANDING') {
                                  onClear(row)
                                } else {
                                  onClassify(row, 'OUTSTANDING')
                                }
                              }}
                              sx={{ px: 1.5, py: 0.5, fontSize: '0.75rem', textTransform: 'none' }}
                            >
                              Outstanding
                            </ToggleButton>
                          </ToggleButtonGroup>

                          <Button
                            size="small"
                            disabled={active === 'UNCLASSIFIED'}
                            onClick={() => onClear(row)}
                            sx={{ minWidth: 0, px: 1, textTransform: 'none', fontSize: '0.75rem' }}
                          >
                            Clear
                          </Button>
                        </Box>
                      </TableCell>
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
