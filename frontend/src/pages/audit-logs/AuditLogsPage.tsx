import React, { useEffect, useState } from 'react'
import {
  Box,
  Paper,
  Typography,
  TextField,
  MenuItem,
  Button,
  Chip,
  IconButton,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TablePagination,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  GridLegacy as Grid,
} from '@mui/material'
import {
  Search,
  Refresh,
  FilterList,
  Visibility,
  GetApp,
  History as AuditIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  fetchAuditLogs,
  fetchAuditLogStatistics,
  setFilters,
  clearFilters,
  setPage,
  setLimit,
  setSelectedAuditLog,
} from '@/store/slices/auditLogSlice'
import { AuditAction, type AuditLog } from '@/types'
import { format } from 'date-fns'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'

const AuditLogsPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const {
    auditLogs,
    selectedAuditLog,
    statistics,
    loading,
    error,
    pagination,
    filters,
  } = useAppSelector((state) => state.auditLogs)

  const [localSearch, setLocalSearch] = useState(filters.search || '')
  const [showFilters, setShowFilters] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Fetch audit logs on mount and when filters/pagination change
  useEffect(() => {
    handleFetchAuditLogs()
  }, [pagination.page, pagination.limit])

  // Fetch statistics on mount
  useEffect(() => {
    dispatch(fetchAuditLogStatistics({}))
  }, [dispatch])

  const handleFetchAuditLogs = () => {
    dispatch(
      fetchAuditLogs({
        page: pagination.page,
        limit: pagination.limit,
        ...filters,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      })
    )
  }

  const handleSearch = () => {
    dispatch(setFilters({ search: localSearch }))
    dispatch(setPage(1))
    handleFetchAuditLogs()
  }

  const handleClearFilters = () => {
    setLocalSearch('')
    dispatch(clearFilters())
    dispatch(setPage(1))
    handleFetchAuditLogs()
  }

  const handlePageChange = (_event: unknown, newPage: number) => {
    dispatch(setPage(newPage + 1))
  }

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setLimit(parseInt(event.target.value, 10)))
    dispatch(setPage(1))
  }

  const handleViewDetails = (log: AuditLog) => {
    dispatch(setSelectedAuditLog(log))
    setDetailsOpen(true)
  }

  const handleCloseDetails = () => {
    setDetailsOpen(false)
    dispatch(setSelectedAuditLog(null))
  }

  const getActionColor = (action: string): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
    switch (action) {
      case 'CREATE':
        return 'success'
      case 'UPDATE':
        return 'info'
      case 'DELETE':
      case 'BULK_DELETE':
        return 'error'
      case 'RESTORE':
      case 'BULK_RESTORE':
        return 'warning'
      case 'EXPORT':
      case 'IMPORT':
        return 'primary'
      default:
        return 'default'
    }
  }

  const formatDate = (date: Date | string) => {
    try {
      return format(new Date(date), 'MMM dd, yyyy HH:mm:ss')
    } catch {
      return 'Invalid date'
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight, mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
          <AuditIcon sx={{ fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize, color: TYPOGRAPHY_STYLES.pageHeader.icon.color }} />
          Audit Logs
        </Typography>
        <Typography variant="body2" color="text.secondary">
          View all system changes and user activities
        </Typography>
      </Box>

      {/* Statistics */}
      {statistics && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Total Logs
              </Typography>
              <Typography variant="h4">{statistics.total.toLocaleString()}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Actions
              </Typography>
              <Typography variant="h4">{statistics.byAction.length}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Entity Types
              </Typography>
              <Typography variant="h4">{statistics.byEntityType.length}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Active Users
              </Typography>
              <Typography variant="h4">{statistics.topUsers.length}</Typography>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            size="small"
            placeholder="Search descriptions..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            sx={{ flexGrow: 1 }}
            slotProps={{
              input: {
                startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />,
              },
            }}
          />
          <Button
            variant="outlined"
            startIcon={<FilterList />}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters
          </Button>
          <Button variant="contained" onClick={handleSearch}>
            Search
          </Button>
          <Button variant="outlined" onClick={handleClearFilters}>
            Clear
          </Button>
          <IconButton onClick={handleFetchAuditLogs} title="Refresh">
            <Refresh />
          </IconButton>
        </Stack>

        {/* Advanced Filters */}
        {showFilters && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Action"
                  value={filters.action || ''}
                  onChange={(e) => dispatch(setFilters({ action: e.target.value as AuditAction }))}
                >
                  <MenuItem value="">All Actions</MenuItem>
                  {Object.values(AuditAction).map((action) => (
                    <MenuItem key={action} value={action}>
                      {action}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Entity Type"
                  value={filters.entityType || ''}
                  onChange={(e) => dispatch(setFilters({ entityType: e.target.value }))}
                  placeholder="e.g., Product, Customer"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="User ID"
                  value={filters.userId || ''}
                  onChange={(e) => dispatch(setFilters({ userId: e.target.value }))}
                  placeholder="e.g., system"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Username"
                  value={filters.username || ''}
                  onChange={(e) => dispatch(setFilters({ username: e.target.value }))}
                  placeholder="Filter by username"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Start Date"
                  value={filters.startDate || ''}
                  onChange={(e) => dispatch(setFilters({ startDate: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="End Date"
                  value={filters.endDate || ''}
                  onChange={(e) => dispatch(setFilters({ endDate: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>
          </Box>
        )}
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date & Time</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Entity Type</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : auditLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No audit logs found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                auditLogs.map((log) => (
                  <TableRow key={log.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={log.action}
                        color={getActionColor(log.action)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{log.entityType}</TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2">
                          {log.username || log.userId}
                        </Typography>
                        {log.username && (
                          <Typography variant="caption" color="text.secondary">
                            {log.userId}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 400 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {log.description}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        onClick={() => handleViewDetails(log)}
                        title="View Details"
                      >
                        <Visibility />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 20, 50, 100]}
          component="div"
          count={pagination.total}
          rowsPerPage={pagination.limit}
          page={pagination.page - 1}
          onPageChange={handlePageChange}
          onRowsPerPageChange={handleRowsPerPageChange}
        />
      </Paper>

      {/* Details Dialog */}
      <Dialog
        open={detailsOpen}
        onClose={handleCloseDetails}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Audit Log Details</DialogTitle>
        <DialogContent>
          {selectedAuditLog && (
            <Box sx={{ mt: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Action
                  </Typography>
                  <Chip
                    label={selectedAuditLog.action}
                    color={getActionColor(selectedAuditLog.action)}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Date & Time
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(selectedAuditLog.createdAt)}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Entity Type
                  </Typography>
                  <Typography variant="body1">{selectedAuditLog.entityType}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Entity ID
                  </Typography>
                  <Typography variant="body1" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                    {selectedAuditLog.entityId || 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    User
                  </Typography>
                  <Typography variant="body1">
                    {selectedAuditLog.username || selectedAuditLog.userId}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    IP Address
                  </Typography>
                  <Typography variant="body1">
                    {selectedAuditLog.ipAddress || 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Description
                  </Typography>
                  <Typography variant="body1">{selectedAuditLog.description}</Typography>
                </Grid>
                {selectedAuditLog.oldValues && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Previous Values
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 2, mt: 1, bgcolor: 'background.default' }}>
                      <pre style={{ margin: 0, fontSize: '0.75rem', overflow: 'auto' }}>
                        {JSON.stringify(selectedAuditLog.oldValues, null, 2)}
                      </pre>
                    </Paper>
                  </Grid>
                )}
                {selectedAuditLog.newValues && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary">
                      New Values
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 2, mt: 1, bgcolor: 'background.default' }}>
                      <pre style={{ margin: 0, fontSize: '0.75rem', overflow: 'auto' }}>
                        {JSON.stringify(selectedAuditLog.newValues, null, 2)}
                      </pre>
                    </Paper>
                  </Grid>
                )}
                {selectedAuditLog.metadata && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Metadata
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 2, mt: 1, bgcolor: 'background.default' }}>
                      <pre style={{ margin: 0, fontSize: '0.75rem', overflow: 'auto' }}>
                        {JSON.stringify(selectedAuditLog.metadata, null, 2)}
                      </pre>
                    </Paper>
                  </Grid>
                )}
                {selectedAuditLog.userAgent && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary">
                      User Agent
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
                      {selectedAuditLog.userAgent}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDetails}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default AuditLogsPage
