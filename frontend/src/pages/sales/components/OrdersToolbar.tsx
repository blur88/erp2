import React from 'react'
import {
  ArrowDownward as ArrowDownIcon,
  ArrowUpward as ArrowUpIcon,
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
} from '@mui/material'

import PageHeader from '@/components/common/PageHeader'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'

interface OrderFilters {
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  dateFilter: string
  customFromDate: string
  customToDate: string
  customerId: string
  paymentStatus: string
  fulfillmentStatus: string
}

interface OrdersToolbarProps {
  isMobile: boolean
  ordersCount: number
  searchInputRef: React.RefObject<HTMLInputElement | null>
  searchTerm: string
  setSearchTerm: (value: string) => void
  orderFilters: OrderFilters
  customers: Array<{ id: string; name: string }>
  onFilterChange: (filters: Partial<OrderFilters>) => void
  onClearFilters: () => void
  onSort: (field: string) => void
  onOpenDeleted: () => void
  onCreateOrder: () => void
}

const OrdersToolbar: React.FC<OrdersToolbarProps> = ({
  isMobile,
  ordersCount,
  searchInputRef,
  searchTerm,
  setSearchTerm,
  orderFilters,
  customers,
  onFilterChange,
  onClearFilters,
  onSort,
  onOpenDeleted,
  onCreateOrder,
}) => {
  const hasActiveFilters =
    orderFilters.dateFilter !== 'all' ||
    orderFilters.customerId !== 'all' ||
    orderFilters.paymentStatus !== 'all' ||
    orderFilters.fulfillmentStatus !== 'all'

  return (
    <>
      <PageHeader
        title="Sales Orders"
        subtitle="Track sales orders and delivery status"
        secondaryAction={{ label: 'View Deleted', onClick: onOpenDeleted }}
        primaryAction={{ label: 'Create Order', onClick: onCreateOrder }}
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
            placeholder="Search orders..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
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
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.icon.fontSize }} />
                  </InputAdornment>
                ),
              },
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
              value={orderFilters.dateFilter}
              label="Date Filter"
              onChange={(event) => onFilterChange({ dateFilter: event.target.value })}
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

          {orderFilters.dateFilter === 'custom' && (
            <>
              <TextField
                label="From Date"
                type="date"
                value={orderFilters.customFromDate}
                onChange={(event) => onFilterChange({ customFromDate: event.target.value })}
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
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="To Date"
                type="date"
                value={orderFilters.customToDate}
                onChange={(event) => onFilterChange({ customToDate: event.target.value })}
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
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </>
          )}

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
            <InputLabel>Customer</InputLabel>
            <Select
              value={orderFilters.customerId}
              label="Customer"
              onChange={(event) => onFilterChange({ customerId: event.target.value })}
            >
              <MenuItem value="all">All</MenuItem>
              {customers.map((customer) => (
                <MenuItem key={customer.id} value={customer.id}>
                  {customer.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

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
            <InputLabel>Payment Status</InputLabel>
            <Select
              value={orderFilters.paymentStatus}
              label="Payment Status"
              onChange={(event) => onFilterChange({ paymentStatus: event.target.value })}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="unpaid">Unpaid</MenuItem>
              <MenuItem value="partial">Partially Paid</MenuItem>
              <MenuItem value="paid">Fully Paid</MenuItem>
              <MenuItem value="overpaid">Overpaid</MenuItem>
            </Select>
          </FormControl>

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
            <InputLabel>Fulfillment</InputLabel>
            <Select
              value={orderFilters.fulfillmentStatus}
              label="Fulfillment"
              onChange={(event) => onFilterChange({ fulfillmentStatus: event.target.value })}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="fulfilled">Fulfilled</MenuItem>
              <MenuItem value="unfulfilled">Unfulfilled</MenuItem>
            </Select>
          </FormControl>

          {hasActiveFilters && (
            <Button
              variant="outlined"
              size="medium"
              onClick={onClearFilters}
              sx={{
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              }}
            >
              Clear Filters
            </Button>
          )}

          <Button
            variant={orderFilters.sortBy === 'orderNumber' ? 'contained' : 'outlined'}
            size="medium"
            sx={{
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
            }}
            startIcon={
              orderFilters.sortBy === 'orderNumber' ? (
                orderFilters.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />
              ) : (
                <SortIcon />
              )
            }
            onClick={() => onSort('orderNumber')}
          >
            Sort
          </Button>
        </Box>
      </Paper>
    </>
  )
}

export default OrdersToolbar
