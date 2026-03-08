import React, { useState, useEffect } from 'react'
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
import {
  useDeactivateUserMutation,
  useGetStatisticsQuery,
  useGetUsersQuery,
  useUnlockUserMutation,
  useUpdateUserMutation,
} from '@/store/api/userManagementApi'
import type { User } from '@/types'
import UserFormDialog from '@/components/settings/UserFormDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { formatDateTime } from '@/utils/formatters'

const UserManagementPage: React.FC = () => {
  const currentUser = useAppSelector((state) => state.auth?.user)
  const { showSuccess, showError } = useNotification()

  // State
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)

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

  const usersQueryParams = {
    page: page + 1,
    limit: rowsPerPage,
    search: searchQuery.trim() || undefined,
    role: roleFilter !== 'all' ? (roleFilter as any) : undefined,
    status: statusFilter !== 'all' ? (statusFilter as any) : undefined,
  }
  const { data: usersResponse, isLoading: loading, error, refetch: refetchUsers } = useGetUsersQuery(usersQueryParams)
  const { data: statistics, refetch: refetchStatistics } = useGetStatisticsQuery()
  const [unlockUser] = useUnlockUserMutation()
  const [deactivateUser] = useDeactivateUserMutation()
  const [updateUser] = useUpdateUserMutation()
  const users = usersResponse?.data ?? []
  const totalCount = usersResponse?.meta?.total ?? 0

  // Check if user is admin
  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      showError('Access denied: Admin privileges required')
      window.location.href = '/dashboard'
    }
  }, [currentUser, showError])

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
    showSuccess(selectedUser ? 'User updated successfully' : 'User created successfully')
  }

  const handleUnlockUser = (user: User) => {
    setConfirmDialog({
      open: true,
      title: 'Unlock User Account',
      message: `Are you sure you want to unlock ${user.username}'s account? This will reset their failed login attempts.`,
      action: async () => {
        try {
          await unlockUser(user.id).unwrap()
          showSuccess('User account unlocked successfully')
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
            await deactivateUser(user.id).unwrap()
            showSuccess('User deactivated successfully')
          } else {
            await updateUser({ id: user.id, data: { status: 'active' } }).unwrap()
            showSuccess('User activated successfully')
          }
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
    return formatDateTime(date)
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: 3
      }}>
        <Box>
          <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{
            fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2
          }}>
            <PeopleIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            User Management
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage system users and access control ({totalCount} total)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => {
              refetchUsers()
              refetchStatistics()
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
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load users
        </Alert>
      )}

      {/* Users Table */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table
            size={TABLE_STYLES.size}
            sx={{
              '& .MuiTableCell-root': {
                borderBottom: TABLE_STYLES.cell.border,
                py: TABLE_STYLES.cell.padding.py,
                px: TABLE_STYLES.cell.padding.px
              },
              '& .MuiTableBody-root .MuiTableRow-root:last-child .MuiTableCell-root': {
                borderBottom: 'none'
              }
            }}
          >
            <TableHead>
              <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                <TableCell>
                  <Typography variant="caption" sx={{
                    fontWeight: 600,
                    color: 'text.secondary',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Username
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{
                    fontWeight: 600,
                    color: 'text.secondary',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Name
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{
                    fontWeight: 600,
                    color: 'text.secondary',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Email
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{
                    fontWeight: 600,
                    color: 'text.secondary',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Role
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{
                    fontWeight: 600,
                    color: 'text.secondary',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Status
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{
                    fontWeight: 600,
                    color: 'text.secondary',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Last Login
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{
                    fontWeight: 600,
                    color: 'text.secondary',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Failed Attempts
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="caption" sx={{
                    fontWeight: 600,
                    color: 'text.secondary',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Actions
                  </Typography>
                </TableCell>
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
                  <TableRow
                    key={user.id}
                    hover
                    sx={{
                      '&:hover': {
                        backgroundColor: 'action.hover',
                        '& .user-actions': {
                          opacity: 1
                        }
                      },
                      transition: 'background-color 0.2s ease',
                      cursor: 'default',
                      height: TABLE_STYLES.row.height
                    }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                          {user.username}
                        </Typography>
                        {user.isLocked && (
                          <Tooltip title="Account is locked">
                            <Chip
                              label="Locked"
                              size="small"
                              color="error"
                              sx={{
                                fontSize: '0.65rem',
                                height: 20
                              }}
                            />
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                        {(() => {
                          if (user.fullName && user.fullName !== 'null') return user.fullName;
                          const firstName = user.firstName && user.firstName !== 'null' ? user.firstName : '';
                          const lastName = user.lastName && user.lastName !== 'null' ? user.lastName : '';
                          return `${firstName} ${lastName}`.trim();
                        })()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                        {user.email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={getRoleLabel(user.role)}
                        size="small"
                        color={getRoleColor(user.role)}
                        sx={{
                          fontSize: '0.65rem',
                          height: 20,
                          fontWeight: 500
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={user.status}
                        size="small"
                        color={getStatusColor(user.status)}
                        sx={{
                          fontSize: '0.65rem',
                          height: 20,
                          fontWeight: 500
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                        {formatDate(user.lastLoginAt)}
                      </Typography>
                      {user.lastLoginIp && (
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          {user.lastLoginIp}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.failedLoginAttempts > 0 && (
                        <Chip
                          label={user.failedLoginAttempts}
                          size="small"
                          color="warning"
                          sx={{
                            fontSize: '0.65rem',
                            height: 20,
                            fontWeight: 500
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Box
                        className="user-actions"
                        sx={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                          gap: 0.25,
                          opacity: 0.7,
                          transition: 'opacity 0.2s ease'
                        }}
                      >
                        <Tooltip title={user.id === currentUser?.id ? 'Edit Profile' : 'Edit User'}>
                          <IconButton
                            size="small"
                            onClick={() => handleEditUser(user)}
                            sx={{
                              height: `${TABLE_STYLES.row.height * 0.75}px`,
                              width: `${TABLE_STYLES.row.height * 0.75}px`,
                              minHeight: 20,
                              minWidth: 20,
                              p: 0.125,
                              color: 'primary.main',
                              '&:hover': {
                                backgroundColor: 'primary.light',
                                color: 'primary.dark'
                              }
                            }}
                          >
                            <EditIcon sx={{
                              fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                            }} />
                          </IconButton>
                        </Tooltip>
                        {user.isLocked && (
                          <Tooltip title="Unlock Account">
                            <IconButton
                              size="small"
                              onClick={() => handleUnlockUser(user)}
                              sx={{
                                height: `${TABLE_STYLES.row.height * 0.75}px`,
                                width: `${TABLE_STYLES.row.height * 0.75}px`,
                                minHeight: 20,
                                minWidth: 20,
                                p: 0.125,
                                color: 'warning.main',
                                '&:hover': {
                                  backgroundColor: 'warning.light',
                                  color: 'warning.dark'
                                }
                              }}
                            >
                              <UnlockIcon sx={{
                                fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                              }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title={user.status === 'active' ? 'Deactivate' : 'Activate'}>
                          <IconButton
                            size="small"
                            onClick={() => handleDeactivateUser(user)}
                            disabled={user.id === currentUser?.id}
                            sx={{
                              height: `${TABLE_STYLES.row.height * 0.75}px`,
                              width: `${TABLE_STYLES.row.height * 0.75}px`,
                              minHeight: 20,
                              minWidth: 20,
                              p: 0.125,
                              color: user.status === 'active' ? 'error.main' : 'success.main',
                              '&:hover': {
                                backgroundColor: user.status === 'active' ? 'error.light' : 'success.light',
                                color: user.status === 'active' ? 'error.dark' : 'success.dark'
                              },
                              '&.Mui-disabled': {
                                opacity: 0.3
                              }
                            }}
                          >
                            <DeleteIcon sx={{
                              fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                            }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
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
        currentUser={currentUser}
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
