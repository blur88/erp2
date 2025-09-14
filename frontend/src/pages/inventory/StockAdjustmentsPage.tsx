import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  LinearProgress,
  TextField,
  InputAdornment,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Grid,
  Avatar,
  Divider,
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
  CloudUpload as ImportIcon,
  Inventory as AdjustmentIcon,
  Timeline as HistoryIcon,
  Assessment as ReportIcon,
} from '@mui/icons-material'
import { inventoryApi } from '@/services/inventoryApi'
import { StockAdjustment, StockAdjustmentType, StockAdjustmentStatus } from '@/types'
import { formatCurrency } from '@/utils/currency'
import StockAdjustmentDialog from './components/StockAdjustmentDialog'
import BulkStockAdjustmentDialog from './components/BulkStockAdjustmentDialog'

const StockAdjustmentsPage: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<StockAdjustmentStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<StockAdjustmentType | 'all'>('all')

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [selectedAdjustment, setSelectedAdjustment] = useState<StockAdjustment | null>(null)

  const fetchAdjustments = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)

      const params = {
        page: page + 1,
        limit: rowsPerPage,
        search: searchTerm || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc' as const,
      }

      const adjustmentsResponse = await inventoryApi.getStockAdjustments(params)

      if (adjustmentsResponse?.data) {
        setAdjustments(adjustmentsResponse.data.data || [])
        setTotalCount(adjustmentsResponse.data.meta?.total || 0)
      }

    } catch (err: any) {
      console.error('Error fetching stock adjustments:', err)
      const errorMessage = err?.response?.data?.message || err?.message || 'Failed to load stock adjustments'
      setError(errorMessage)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [page, rowsPerPage, searchTerm, statusFilter, typeFilter])

  useEffect(() => {
    fetchAdjustments()
  }, [fetchAdjustments])

  const handleRefresh = () => {
    fetchAdjustments(true)
  }

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage)
  }

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
  }

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value)
    setPage(0)
  }

  const handleStatusFilterChange = (event: any) => {
    setStatusFilter(event.target.value)
    setPage(0)
  }

  const handleTypeFilterChange = (event: any) => {
    setTypeFilter(event.target.value)
    setPage(0)
  }

  const handleCreateAdjustment = () => {
    setSelectedAdjustment(null)
    setCreateDialogOpen(true)
  }

  const handleEditAdjustment = (adjustment: StockAdjustment) => {
    setSelectedAdjustment(adjustment)
    setCreateDialogOpen(true)
  }

  const getStatusColor = (status: StockAdjustmentStatus) => {
    switch (status) {
      case StockAdjustmentStatus.DRAFT: return 'info'
      case StockAdjustmentStatus.PENDING_APPROVAL: return 'warning'
      case StockAdjustmentStatus.APPROVED: return 'success'
      case StockAdjustmentStatus.COMPLETED: return 'success'
      case StockAdjustmentStatus.REJECTED: return 'error'
      case StockAdjustmentStatus.CANCELLED: return 'default'
      default: return 'default'
    }
  }

  const getTypeIcon = (type: StockAdjustmentType) => {
    switch (type) {
      case StockAdjustmentType.PHYSICAL_COUNT: return '📊'
      case StockAdjustmentType.DAMAGE: return '💥'
      case StockAdjustmentType.THEFT: return '🔒'
      case StockAdjustmentType.EXPIRY: return '⏰'
      case StockAdjustmentType.LOSS: return '📉'
      case StockAdjustmentType.FOUND: return '🔍'
      case StockAdjustmentType.CORRECTION: return '🔧'
      case StockAdjustmentType.WRITE_OFF: return '❌'
      case StockAdjustmentType.REVALUATION: return '💰'
      default: return '📝'
    }
  }

  const formatAdjustmentType = (type: StockAdjustmentType) => {
    return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')
  }

  if (loading && !refreshing) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2, textAlign: 'center' }}>Loading stock adjustments...</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
            <AdjustmentIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            Stock Adjustments
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage inventory adjustments and stock corrections
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Tooltip title="Refresh">
            <IconButton 
              onClick={handleRefresh} 
              disabled={refreshing}
              sx={{ bgcolor: 'action.hover' }}
            >
              <RefreshIcon className={refreshing ? 'rotate' : ''} />
            </IconButton>
          </Tooltip>
          <Button
            variant="outlined"
            startIcon={<ImportIcon />}
            onClick={() => setBulkDialogOpen(true)}
          >
            Bulk Import
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            size="large"
            onClick={handleCreateAdjustment}
          >
            New Adjustment
          </Button>
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Quick Stats */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48, mx: 'auto', mb: 2 }}>
                <HistoryIcon />
              </Avatar>
              <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
                {totalCount}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                Total Adjustments
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar sx={{ bgcolor: 'success.main', width: 48, height: 48, mx: 'auto', mb: 2 }}>
                <AdjustmentIcon />
              </Avatar>
              <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
                {adjustments.filter(a => a.status === StockAdjustmentStatus.COMPLETED).length}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                This Page Active
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar sx={{ bgcolor: 'info.main', width: 48, height: 48, mx: 'auto', mb: 2 }}>
                <ReportIcon />
              </Avatar>
              <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
                {adjustments.reduce((sum, adj) => sum + Math.abs(adj.adjustmentQuantity), 0)}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                Total Qty Adjusted
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search adjustments..."
                value={searchTerm}
                onChange={handleSearchChange}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  )
                }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  onChange={handleStatusFilterChange}
                  label="Status"
                >
                  <MenuItem value="all">All Statuses</MenuItem>
                  <MenuItem value={StockAdjustmentStatus.DRAFT}>Draft</MenuItem>
                  <MenuItem value={StockAdjustmentStatus.PENDING_APPROVAL}>Pending Approval</MenuItem>
                  <MenuItem value={StockAdjustmentStatus.APPROVED}>Approved</MenuItem>
                  <MenuItem value={StockAdjustmentStatus.COMPLETED}>Completed</MenuItem>
                  <MenuItem value={StockAdjustmentStatus.REJECTED}>Rejected</MenuItem>
                  <MenuItem value={StockAdjustmentStatus.CANCELLED}>Cancelled</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Type</InputLabel>
                <Select
                  value={typeFilter}
                  onChange={handleTypeFilterChange}
                  label="Type"
                >
                  <MenuItem value="all">All Types</MenuItem>
                  <MenuItem value={StockAdjustmentType.PHYSICAL_COUNT}>Physical Count</MenuItem>
                  <MenuItem value={StockAdjustmentType.DAMAGE}>Damage</MenuItem>
                  <MenuItem value={StockAdjustmentType.EXPIRY}>Expiry</MenuItem>
                  <MenuItem value={StockAdjustmentType.THEFT}>Theft</MenuItem>
                  <MenuItem value={StockAdjustmentType.LOSS}>Loss</MenuItem>
                  <MenuItem value={StockAdjustmentType.FOUND}>Found</MenuItem>
                  <MenuItem value={StockAdjustmentType.CORRECTION}>Correction</MenuItem>
                  <MenuItem value={StockAdjustmentType.WRITE_OFF}>Write Off</MenuItem>
                  <MenuItem value={StockAdjustmentType.REVALUATION}>Revaluation</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<FilterIcon />}
                onClick={() => {
                  setSearchTerm('')
                  setStatusFilter('all')
                  setTypeFilter('all')
                  setPage(0)
                }}
              >
                Clear
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Adjustments Table */}
      <Card>
        <TableContainer>
          {refreshing && <LinearProgress />}
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">System Qty</TableCell>
                <TableCell align="right">Actual Qty</TableCell>
                <TableCell align="right">Adjustment</TableCell>
                <TableCell align="right">Value</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {adjustments.map((adjustment) => (
                <TableRow key={adjustment.id} hover>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {adjustment.product?.name || 'Unknown Product'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {adjustment.product?.barcode && `SKU: ${adjustment.product.barcode}`}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>{getTypeIcon(adjustment.type)}</span>
                      <Typography variant="body2">
                        {formatAdjustmentType(adjustment.type)}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {adjustment.systemQuantity.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {adjustment.actualQuantity.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontWeight: 600,
                        color: adjustment.adjustmentQuantity > 0 ? 'success.main' : 'error.main'
                      }}
                    >
                      {adjustment.adjustmentQuantity > 0 ? '+' : ''}{adjustment.adjustmentQuantity.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {adjustment.totalValueImpact ? formatCurrency(adjustment.totalValueImpact) : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={adjustment.status.toUpperCase()}
                      size="small"
                      color={getStatusColor(adjustment.status) as any}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {new Date(adjustment.createdAt).toLocaleDateString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(adjustment.createdAt).toLocaleTimeString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="View Details">
                        <IconButton size="small">
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => handleEditAdjustment(adjustment)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
              {adjustments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="text.secondary">
                      No stock adjustments found. {searchTerm || statusFilter !== 'all' || typeFilter !== 'all' ? 'Try adjusting your filters.' : 'Create your first adjustment to get started.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={totalCount}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Card>

      {/* Dialogs */}
      <StockAdjustmentDialog
        open={createDialogOpen}
        onClose={() => {
          setCreateDialogOpen(false)
          setSelectedAdjustment(null)
        }}
        adjustment={selectedAdjustment}
        onSuccess={() => {
          setCreateDialogOpen(false)
          setSelectedAdjustment(null)
          fetchAdjustments(true)
        }}
      />


      <BulkStockAdjustmentDialog
        open={bulkDialogOpen}
        onClose={() => setBulkDialogOpen(false)}
        onSuccess={() => {
          setBulkDialogOpen(false)
          fetchAdjustments(true)
        }}
      />
    </Box>
  )
}

export default StockAdjustmentsPage