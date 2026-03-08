import React from 'react'
import {
  Add as AddIcon,
  ArrowDownward as ArrowDownIcon,
  ArrowUpward as ArrowUpIcon,
  Description as OrderIcon,
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

import { TYPOGRAPHY_STYLES } from '@/constants/typography'
import type { PurchaseOrdersPageState } from '../hooks/usePurchaseOrdersPageState'

interface PurchaseOrdersToolbarProps {
  isMobile: boolean
  ordersCount: number
  filters: PurchaseOrdersPageState
  suppliers: Array<{ id: string; companyName: string }>
  searchInputRef: React.RefObject<HTMLInputElement | null>
  onFilterChange: (updates: Partial<PurchaseOrdersPageState>) => void
  onClearFilters: () => void
  onSort: (field: string) => void
  onOpenDeleted: () => void
  onCreateOrder: () => void
}

const PurchaseOrdersToolbar: React.FC<PurchaseOrdersToolbarProps> = ({
  isMobile,
  ordersCount,
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
      <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', mb: 3, gap: isMobile ? 2 : 0 }}>
        <Box sx={{ mb: isMobile ? 2 : 0 }}>
          <Typography variant={isMobile ? TYPOGRAPHY_STYLES.pageHeader.mobileVariant : TYPOGRAPHY_STYLES.pageHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight, mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
            <OrderIcon sx={{ fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize, color: TYPOGRAPHY_STYLES.pageHeader.icon.color }} />
            Purchase Orders
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage supplier purchase orders and procurement ({ordersCount} total)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 1.5 : 1, alignItems: isMobile ? 'stretch' : 'center' }}>
          <Button variant="outlined" startIcon={!isMobile ? <RestoreIcon /> : undefined} onClick={onOpenDeleted} fullWidth={isMobile} sx={{ color: 'warning.main', borderColor: 'warning.main' }}>
            View Deleted
          </Button>
          <Button variant="contained" startIcon={!isMobile ? <AddIcon /> : undefined} onClick={onCreateOrder} fullWidth={isMobile}>
            {isMobile ? 'Create New Order' : 'Create Order'}
          </Button>
        </Box>
      </Box>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 2 : 1, alignItems: isMobile ? 'stretch' : 'center', '& > *': { alignSelf: isMobile ? 'stretch' : 'flex-start' } }}>
          <TextField
            inputRef={searchInputRef}
            placeholder="Search orders..."
            value={filters.search}
            onChange={(event) => onFilterChange({ search: event.target.value })}
            size="medium"
            sx={{ minWidth: isMobile ? 'auto' : 250, flex: isMobile ? 'none' : 1, maxWidth: isMobile ? 'none' : 400 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.icon.fontSize }} />
                </InputAdornment>
              ),
            }}
          />

          <FormControl size="medium" sx={{ minWidth: isMobile ? 'auto' : 120 }}>
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
              <TextField label="From Date" type="date" value={filters.customFromDate} onChange={(event) => onFilterChange({ customFromDate: event.target.value })} size="medium" sx={{ minWidth: isMobile ? 'auto' : 120 }} InputLabelProps={{ shrink: true }} />
              <TextField label="To Date" type="date" value={filters.customToDate} onChange={(event) => onFilterChange({ customToDate: event.target.value })} size="medium" sx={{ minWidth: isMobile ? 'auto' : 120 }} InputLabelProps={{ shrink: true }} />
            </>
          )}

          <FormControl size="medium" sx={{ minWidth: isMobile ? 'auto' : 120 }}>
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
            <Button variant="outlined" size="medium" onClick={onClearFilters}>
              Clear Filters
            </Button>
          )}

          <Button
            variant={filters.sortBy === 'orderNumber' ? 'contained' : 'outlined'}
            size="medium"
            startIcon={filters.sortBy === 'orderNumber' ? filters.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon /> : <SortIcon />}
            onClick={() => onSort('orderNumber')}
          >
            Sort
          </Button>
        </Box>
      </Paper>
    </>
  )
}

export default PurchaseOrdersToolbar
