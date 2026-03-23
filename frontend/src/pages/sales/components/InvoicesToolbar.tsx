import React from 'react'
import {
  Box,
  Button,
  Divider,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
} from '@mui/material'
import {
  ArrowDownward as ArrowDownIcon,
  ArrowUpward as ArrowUpIcon,
  Search as SearchIcon,
  Sort as SortIcon,
} from '@mui/icons-material'

import type { InvoiceFilters } from '../hooks/useInvoicesPageState'

import PageHeader from '@/components/common/PageHeader'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'

interface InvoicesToolbarProps {
  isMobile: boolean
  total: number
  filters: InvoiceFilters
  searchInputRef: React.RefObject<HTMLInputElement | null>
  searchTerm: string
  setSearchTerm: (value: string) => void
  onFilterChange: (updates: Partial<InvoiceFilters>) => void
  onResetFilters: () => void
  onSort: (field: string) => void
  onOpenDeleted: () => void
}

const InvoicesToolbar: React.FC<InvoicesToolbarProps> = ({
  isMobile,
  total,
  filters,
  searchInputRef,
  searchTerm,
  setSearchTerm,
  onFilterChange,
  onResetFilters,
  onSort,
  onOpenDeleted,
}) => {
  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle={`Manage customer invoices and track payments (${total} total)`}
        secondaryAction={{ label: 'View Deleted', onClick: onOpenDeleted }}
      />

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 2 : 1,
            alignItems: isMobile ? 'stretch' : 'center',
            '& > *': {
              alignSelf: isMobile ? 'stretch' : 'flex-start',
            },
          }}
        >
          <TextField
            inputRef={searchInputRef}
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value)}
            size="medium"
            sx={{
              minWidth: isMobile ? 'auto' : 250,
              flex: isMobile ? 'none' : 1,
              maxWidth: isMobile ? 'none' : 400,
              '& .MuiOutlinedInput-root': {
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                '& input': {
                  padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                  fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                },
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.icon.fontSize }} />
                </InputAdornment>
              ),
            }}
          />

          <FormControl
            size="medium"
            sx={{
              minWidth: isMobile ? 'auto' : 120,
              '& .MuiOutlinedInput-root': {
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              },
            }}
          >
            <InputLabel>Date Filter</InputLabel>
            <Select
              value={filters.dateFilter}
              label="Date Filter"
              onChange={(event) => onFilterChange({ dateFilter: event.target.value })}
              sx={{
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                '& .MuiSelect-select': {
                  padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                  fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                },
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    '& .MuiMenuItem-root': {
                      fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    },
                  },
                },
              }}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="today">Today</MenuItem>
              <MenuItem value="yesterday">Yesterday</MenuItem>
              <MenuItem value="this_week">This Week</MenuItem>
              <MenuItem value="this_month">This Month</MenuItem>
              <MenuItem value="this_year">This Year</MenuItem>
              <Divider />
              <MenuItem value="custom">Custom Date Range</MenuItem>
            </Select>
          </FormControl>

          {filters.dateFilter === 'custom' && (
            <>
              <TextField
                label="From Date"
                type="date"
                value={filters.customFromDate}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => onFilterChange({ customFromDate: event.target.value })}
                size="medium"
                sx={{
                  minWidth: 120,
                  '& .MuiOutlinedInput-root': {
                    height: TYPOGRAPHY_STYLES.searchField.input.height,
                    fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    '& input': {
                      padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                      fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    },
                  },
                }}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="To Date"
                type="date"
                value={filters.customToDate}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => onFilterChange({ customToDate: event.target.value })}
                size="medium"
                sx={{
                  minWidth: 120,
                  '& .MuiOutlinedInput-root': {
                    height: TYPOGRAPHY_STYLES.searchField.input.height,
                    fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    '& input': {
                      padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                      fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    },
                  },
                }}
                InputLabelProps={{ shrink: true }}
              />
            </>
          )}

          {(filters.dateFilter !== 'all' || filters.search) && (
            <Button
              variant="outlined"
              size="medium"
              onClick={onResetFilters}
              sx={{
                minWidth: 'auto',
                px: 2,
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              }}
            >
              Clear Filters
            </Button>
          )}

          <Button
            variant={filters.sortBy === 'invoiceNumber' ? 'contained' : 'outlined'}
            size="medium"
            startIcon={
              filters.sortBy === 'invoiceNumber'
                ? filters.sortOrder === 'desc'
                  ? <ArrowDownIcon />
                  : <ArrowUpIcon />
                : <SortIcon />
            }
            onClick={() => onSort('invoiceNumber')}
            sx={{
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              minWidth: 'auto',
              px: 2,
            }}
          >
            Sort
          </Button>
        </Box>
      </Paper>
    </>
  )
}

export default InvoicesToolbar
