import React from 'react'
import {
  Add as AddIcon,
  ArrowDownward as ArrowDownIcon,
  ArrowUpward as ArrowUpIcon,
  RestoreFromTrash as RestoreIcon,
  Search as SearchIcon,
  Sort as SortIcon,
} from '@mui/icons-material'
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
  Typography,
} from '@mui/material'

import PageHeader from '@/components/common/PageHeader'

type LegacyPurchaseOrdersFilters = {
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  supplierFilter: string
  dateFilter: string
  customFromDate: string
  customToDate: string
}

interface PurchaseOrdersToolbarProps {
  isMobile: boolean
  ordersCount: number
  filters: LegacyPurchaseOrdersFilters
  suppliers: Array<{ id: string; companyName: string }>
  searchInputRef: React.RefObject<HTMLInputElement | null>
  onFilterChange: (updates: Partial<LegacyPurchaseOrdersFilters>) => void
  onClearFilters: () => void
  onSort: (field: string) => void
  onOpenDeleted: () => void
  onCreateOrder: () => void
}

const PurchaseOrdersToolbar: React.FC<PurchaseOrdersToolbarProps> = ({
  isMobile,
  filters,
  suppliers,
  searchInputRef,
  onFilterChange,
  onClearFilters,
  onSort,
  onOpenDeleted,
  onCreateOrder,
}) => {
  const hasActiveFilters = filters.dateFilter !== 'all' || filters.supplierFilter !== 'all'

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle="Manage supplier purchase orders and procurement"
        secondaryAction={{ label: 'View Deleted', onClick: onOpenDeleted }}
        primaryAction={{ label: 'Create Order', onClick: onCreateOrder }}
      />

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 2 : 1, alignItems: isMobile ? 'stretch' : 'center', '& > *': { alignSelf: isMobile ? 'stretch' : 'flex-start' } }}>
          <TextField
            inputRef={searchInputRef}
            placeholder="Search orders..."
            value={filters.search}
            onChange={(event) => onFilterChange({ search: event.target.value })}
            size="medium"
            sx={{
              minWidth: isMobile ? 'auto' : 250,
              flex: isMobile ? 'none' : 1,
              maxWidth: isMobile ? 'none' : 400,
              '& .MuiOutlinedInput-root': {
                height: '40px',
                fontSize: '0.875rem',
                '& input': {
                  padding: '8.5px 14px',
                  fontSize: '0.875rem',
                },
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: '1.25rem' }} />
                </InputAdornment>
              ),
            }}
          />

          <FormControl
            size="medium"
            sx={{
              minWidth: isMobile ? 'auto' : 120,
              '& .MuiOutlinedInput-root': {
                height: '40px',
                fontSize: '0.875rem',
              },
            }}
          >
            <InputLabel>Date Filter</InputLabel>
            <Select value={filters.dateFilter} label="Date Filter" onChange={(event) => onFilterChange({ dateFilter: event.target.value })}>
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
                onChange={(event) => onFilterChange({ customFromDate: event.target.value })}
                size="medium"
                sx={{
                  minWidth: isMobile ? 'auto' : 120,
                  '& .MuiOutlinedInput-root': {
                    height: '40px',
                    fontSize: '0.875rem',
                    '& input': {
                      padding: '8.5px 14px',
                      fontSize: '0.875rem',
                    },
                  },
                }}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="To Date"
                type="date"
                value={filters.customToDate}
                onChange={(event) => onFilterChange({ customToDate: event.target.value })}
                size="medium"
                sx={{
                  minWidth: isMobile ? 'auto' : 120,
                  '& .MuiOutlinedInput-root': {
                    height: '40px',
                    fontSize: '0.875rem',
                    '& input': {
                      padding: '8.5px 14px',
                      fontSize: '0.875rem',
                    },
                  },
                }}
                InputLabelProps={{ shrink: true }}
              />
            </>
          )}

          <FormControl
            size="medium"
            sx={{
              minWidth: isMobile ? 'auto' : 120,
              '& .MuiOutlinedInput-root': {
                height: '40px',
                fontSize: '0.875rem',
              },
            }}
          >
            <InputLabel>Supplier</InputLabel>
            <Select value={filters.supplierFilter} label="Supplier" onChange={(event) => onFilterChange({ supplierFilter: event.target.value })}>
              <MenuItem value="all">All</MenuItem>
              {suppliers.map((supplier) => (
                <MenuItem key={supplier.id} value={supplier.id}>
                  {supplier.companyName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {hasActiveFilters && (
            <Button
              variant="outlined"
              size="medium"
              onClick={onClearFilters}
              sx={{ height: '40px', fontSize: '0.875rem' }}
            >
              Clear Filters
            </Button>
          )}

          <Button
            variant={filters.sortBy === 'orderNumber' ? 'contained' : 'outlined'}
            size="medium"
            startIcon={filters.sortBy === 'orderNumber' ? filters.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon /> : <SortIcon />}
            onClick={() => onSort('orderNumber')}
            sx={{ height: '40px', fontSize: '0.875rem' }}
          >
            Sort
          </Button>
        </Box>
      </Paper>
    </>
  )
}

export default PurchaseOrdersToolbar
