import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Alert,
  CircularProgress,
  Chip,
  Tooltip,
  Stack,
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  LockOpen as UnlockIcon,
  People as PeopleIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useAppSelector } from '@/hooks/useRedux'
import { useNotification } from '@/hooks/useNotification'
import { userManagementApi } from '@/services/userManagementApi'
import type { User } from '@/types'
import UserFormDialog from '@/components/settings/UserFormDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { TABLE_STYLES } from '@/constants/typography'

const UserManagementPage: React.FC = () => {
  const currentUser = useAppSelector((state) => state.auth?.user)
  const { showSuccess, showError } = useNotification()

  // State
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [totalCount, setTotalCount] = useState(0)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Dialog states
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    message: string
    action: () => void
  }>({
    open: false,
    title: '',
    message: '',
    action: () => {},
  })

  // Statistics
  const [statistics, setStatistics] = useState<{
    total: number
    active: number
    inactive: number
    locked: number
  } | null>(null)

  // Check if user is admin
  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      showError('Access denied: Admin privileges required')
      window.location.href = '/dashboard'
    }
  }, [currentUser, showError])

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const filters: any = {
        page: page + 1,
        limit: rowsPerPage,
      }

      if (searchQuery.trim()) {
        filters.search = searchQuery.trim()
      }

      if (roleFilter !== 'all') {
        filters.role = roleFilter
      }

      if (statusFilter !== 'all') {
        filters.status = statusFilter
      }

      const response = await userManagementApi.getUsers(filters)
      setUsers(response.data || [])
      setTotalCount(response.meta?.total || 0)
    } catch (err: any) {
      console.error('Failed to fetch users:', err)
      setError(err.response?.data?.message || 'Failed to load users')
      showError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [page, rowsPerPage, searchQuery, roleFilter, statusFilter, showError])

  // Fetch statistics
  const fetchStatistics = useCallback(async () => {
    try {
      const stats = await userManagementApi.getStatistics()
      setStatistics(stats)
    } catch (err: any) {
      console.error('Failed to fetch statistics:', err)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchStatistics()
  }, [fetchUsers, fetchStatistics])

  // Handlers
  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value)
    setPage(0)
  }

  const handleRoleFilterChange = (event: any) => {
    setRoleFilter(event.target.value)
    setPage(0)
  }

  const handleStatusFilterChange = (event: any) => {
    setStatusFilter(event.target.value)
    setPage(0)
  }

  const handlePageChange = (_event: unknown, newPage: number) => {
    setPage(newPage)
  }

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
  }

  const handleAddUser = () => {
    setSelectedUser(null)
    setFormDialogOpen(true)
  }

  const handleEditUser = (user: User) => {
    setSelectedUser(user)
    setFormDialogOpen(true)
  }

  const handleFormClose = () => {
    setFormDialogOpen(false)
    setSelectedUser(null)
  }

  const handleFormSuccess = () => {
    setFormDialogOpen(false)
    setSelectedUser(null)
    fetchUsers()
    fetchStatistics()
    showSuccess(selectedUser ? 'User updated successfully' : 'User created successfully')
  }

  const handleUnlockUser = (user: User) => {
    setConfirmDialog({
      open: true,
      title: 'Unlock User Account',
      message: `Are you sure you want to unlock ${user.username}'s account? This will reset their failed login attempts.`,
      action: async () => {
        try {
          await userManagementApi.unlockUser(user.id)
          showSuccess('User account unlocked successfully')
          fetchUsers()
          fetchStatistics()
        } catch (err: any) {
          showError(err.response?.data?.message || 'Failed to unlock user')
        }
      },
    })
  }

  const handleDeactivateUser = (user: User) => {
    const action = user.status === 'active' ? 'deactivate' : 'activate'
    setConfirmDialog({
      open: true,
      title: `${action === 'deactivate' ? 'Deactivate' : 'Activate'} User`,
      message: `Are you sure you want to ${action} ${user.username}?`,
      action: async () => {
        try {
          if (action === 'deactivate') {
            await userManagementApi.deactivateUser(user.id)
            showSuccess('User deactivated successfully')
          } else {
            await userManagementApi.updateUser(user.id, { status: 'active' })
            showSuccess('User activated successfully')
          }
          fetchUsers()
          fetchStatistics()
        } catch (err: any) {
          showError(err.response?.data?.message || `Failed to ${action} user`)
        }
      },
    })
  }

  const handleConfirmClose = () => {
    setConfirmDialog({ ...confirmDialog, open: false })
  }

  const handleConfirmAction = () => {
    confirmDialog.action()
    handleConfirmClose()
  }

  // Role label mapping
  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Admin',
      manager: 'Manager',
      sales_staff: 'Sales Staff',
      inventory_staff: 'Inventory Staff',
      procurement_staff: 'Procurement Staff',
    }
    return labels[role] || role
  }

  // Role color mapping
  const getRoleColor = (role: string): 'error' | 'warning' | 'info' | 'success' | 'primary' => {
    const colors: Record<string, 'error' | 'warning' | 'info' | 'success' | 'primary'> = {
      admin: 'error',
      manager: 'warning',
      sales_staff: 'info',
      inventory_staff: 'success',
      procurement_staff: 'primary',
    }
    return colors[role] || 'primary'
  }

  // Status color mapping
  const getStatusColor = (status: string): 'success' | 'error' | 'warning' => {
    const colors: Record<string, 'success' | 'error' | 'warning'> = {
      active: 'success',
      inactive: 'error',
      suspended: 'warning',
    }
    return colors[status] || 'error'
  }

  // Format date
  const formatDate = (date?: Date | string) => {
    if (!date) return 'Never'
    return new Date(date).toLocaleString()
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <PeopleIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              User Management
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage system users and access control
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => {
              fetchUsers()
              fetchStatistics()
            }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddUser}
          >
            Add User
          </Button>
        </Box>
      </Box>

      {/* Statistics Cards */}
      {statistics && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">Total Users</Typography>
            <Typography variant="h4">{statistics.total}</Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">Active</Typography>
            <Typography variant="h4" color="success.main">{statistics.active}</Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">Inactive</Typography>
            <Typography variant="h4" color="error.main">{statistics.inactive}</Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">Locked</Typography>
            <Typography variant="h4" color="warning.main">{statistics.locked}</Typography>
          </Paper>
        </Box>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            placeholder="Search by name, email, or username..."
            value={searchQuery}
            onChange={handleSearch}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ flexGrow: 1 }}
          />
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Role</InputLabel>
            <Select value={roleFilter} onChange={handleRoleFilterChange} label="Role">
              <MenuItem value="all">All Roles</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
              <MenuItem value="manager">Manager</MenuItem>
              <MenuItem value="sales_staff">Sales Staff</MenuItem>
              <MenuItem value="inventory_staff">Inventory Staff</MenuItem>
              <MenuItem value="procurement_staff">Procurement Staff</MenuItem>
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} onChange={handleStatusFilterChange} label="Status">
              <MenuItem value="all">All Statuses</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
              <MenuItem value="suspended">Suspended</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Users Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...TABLE_STYLES.header, fontWeight: 600 }}>Username</TableCell>
                <TableCell sx={{ ...TABLE_STYLES.header, fontWeight: 600 }}>Name</TableCell>
                <TableCell sx={{ ...TABLE_STYLES.header, fontWeight: 600 }}>Email</TableCell>
                <TableCell sx={{ ...TABLE_STYLES.header, fontWeight: 600 }}>Role</TableCell>
                <TableCell sx={{ ...TABLE_STYLES.header, fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ ...TABLE_STYLES.header, fontWeight: 600 }}>Last Login</TableCell>
                <TableCell sx={{ ...TABLE_STYLES.header, fontWeight: 600 }}>Failed Attempts</TableCell>
                <TableCell sx={{ ...TABLE_STYLES.header, fontWeight: 600 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                    <Typography color="text.secondary">No users found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell sx={TABLE_STYLES.cell}>
                      {user.username}
                      {user.isLocked && (
                        <Tooltip title="Account is locked">
                          <Chip
                            label="Locked"
                            size="small"
                            color="error"
                            sx={{ ml: 1 }}
                          />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell sx={TABLE_STYLES.cell}>
                      {user.fullName || `${user.firstName} ${user.lastName}`}
                    </TableCell>
                    <TableCell sx={TABLE_STYLES.cell}>{user.email}</TableCell>
                    <TableCell sx={TABLE_STYLES.cell}>
                      <Chip
                        label={getRoleLabel(user.role)}
                        size="small"
                        color={getRoleColor(user.role)}
                      />
                    </TableCell>
                    <TableCell sx={TABLE_STYLES.cell}>
                      <Chip
                        label={user.status}
                        size="small"
                        color={getStatusColor(user.status)}
                      />
                    </TableCell>
                    <TableCell sx={TABLE_STYLES.cell}>
                      {formatDate(user.lastLoginAt)}
                      {user.lastLoginIp && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {user.lastLoginIp}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={TABLE_STYLES.cell}>
                      {user.failedLoginAttempts > 0 && (
                        <Chip
                          label={user.failedLoginAttempts}
                          size="small"
                          color="warning"
                        />
                      )}
                    </TableCell>
                    <TableCell sx={TABLE_STYLES.cell} align="right">
                      <Tooltip title="Edit User">
                        <IconButton
                          size="small"
                          onClick={() => handleEditUser(user)}
                          disabled={user.id === currentUser?.id}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {user.isLocked && (
                        <Tooltip title="Unlock Account">
                          <IconButton
                            size="small"
                            onClick={() => handleUnlockUser(user)}
                            color="warning"
                          >
                            <UnlockIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title={user.status === 'active' ? 'Deactivate' : 'Activate'}>
                        <IconButton
                          size="small"
                          onClick={() => handleDeactivateUser(user)}
                          color={user.status === 'active' ? 'error' : 'success'}
                          disabled={user.id === currentUser?.id}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
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
          count={totalCount}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handlePageChange}
          onRowsPerPageChange={handleRowsPerPageChange}
        />
      </Paper>

      {/* User Form Dialog */}
      <UserFormDialog
        open={formDialogOpen}
        user={selectedUser}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={handleConfirmAction}
        onCancel={handleConfirmClose}
      />
    </Box>
  )
}

export default UserManagementPage
