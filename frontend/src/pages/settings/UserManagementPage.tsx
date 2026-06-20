import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
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
} from '@mui/material'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as UnlockIcon } from '@mui/icons-material/LockOpen'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { FilterBar } from '@/components/filters'
import PageHeader from '@/components/common/PageHeader'
import { StatusChip } from '@/components/common/StatusChip'
import GenericOverviewPage from '@/components/common/GenericOverviewPage'
import { useFilterBar } from '@/hooks/useFilterBar'
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
import { PAGINATION, TABLE_STYLES } from '@/constants/tableStyles'
import { formatDateTime } from '@/utils/formatters'
import type { FilterBarConfig } from '@/types/filterBar.types'

interface UserFilters {
  search: string
  role: 'admin' | 'manager' | 'sales_staff' | 'inventory_staff' | 'procurement_staff' | null
  status: 'active' | 'inactive' | 'suspended' | null
}

const UserManagementPage: React.FC = () => {
  const currentUser = useAppSelector((state) => state.auth?.user)
  const { showSuccess, showError } = useNotification()

  // State
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState<number>(PAGINATION.defaultPageSize)

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

  const filterConfig = useMemo<FilterBarConfig<UserFilters>>(
    () => ({
      search: { placeholder: 'Search by name, email, or username...' },
      fields: [
        { field: 'role', label: 'Role', type: 'role' },
        { field: 'status', label: 'Status', type: 'user-status' },
      ],
      defaults: { search: '', role: null, status: null },
    }),
    [],
  )
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } =
    useFilterBar(filterConfig)

  const userQueryParams = useMemo(
    () => ({
      page: page + 1,
      limit: rowsPerPage,
      search: appliedFilters.search || undefined,
      role: appliedFilters.role ?? undefined,
      status: appliedFilters.status ?? undefined,
    }),
    [appliedFilters, page, rowsPerPage],
  )
  const { data: usersResponse, isLoading, isFetching, error, refetch: refetchUsers } =
    useGetUsersQuery(userQueryParams)
  const { data: statistics, refetch: refetchStatistics } = useGetStatisticsQuery()
  const [unlockUser] = useUnlockUserMutation()
  const [deactivateUser] = useDeactivateUserMutation()
  const [updateUser] = useUpdateUserMutation()
  const users = usersResponse?.data ?? []
  const totalCount = usersResponse?.meta?.total ?? 0
  const resetPage = useCallback(() => {
    setPage(0)
  }, [])

  const filterHandlers = useMemo(
    () => ({
      ...handlers,
      onSearchChange: (value: string) => {
        resetPage()
        handlers.onSearchChange(value)
      },
      onSearchCommit: () => {
        resetPage()
        handlers.onSearchCommit()
      },
      onQuickFilterChange: (field: keyof UserFilters, value: unknown) => {
        resetPage()
        handlers.onQuickFilterChange(field, value)
      },
      onClearField: (field: keyof UserFilters) => {
        resetPage()
        handlers.onClearField(field)
      },
      onClearAll: () => {
        resetPage()
        handlers.onClearAll()
      },
    }),
    [handlers, resetPage],
  )

  // Check if user is admin
  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      showError('Access denied: Admin privileges required')
      window.location.href = '/dashboard'
    }
  }, [currentUser, showError])

  // Handlers
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

  // Format date
  const formatDate = (date?: Date | string) => {
    if (!date) return 'Never'
    return formatDateTime(date)
  }

  return (
    <GenericOverviewPage>
      {/* Header */}
      <PageHeader
        title="User Management"
        subtitle="Manage system users and access control"
        variant="workflow"
        secondaryAction={{
          label: 'Refresh',
          onClick: () => {
            refetchUsers()
            refetchStatistics()
          },
        }}
        primaryAction={{ label: 'Add User', onClick: handleAddUser }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={filterHandlers}
            hasActiveFilters={hasActiveFilters}
          />
        )}
      />
      {/* Statistics Cards */}
      {statistics && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>Total Users</Typography>
            <Typography variant="h4">{statistics.total}</Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>Active</Typography>
            <Typography variant="h4" sx={{
              color: "success.main"
            }}>{statistics.active}</Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>Inactive</Typography>
            <Typography variant="h4" sx={{
              color: "error.main"
            }}>{statistics.inactive}</Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>Locked</Typography>
            <Typography variant="h4" sx={{
              color: "warning.main"
            }}>{statistics.locked}</Typography>
          </Paper>
        </Box>
      )}
      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load users
        </Alert>
      )}
      {/* Users Table */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {(isLoading || (isFetching && !usersResponse)) ? (
          <ListSkeleton rows={8} columns={4} />
        ) : (
          <Box sx={{ opacity: isFetching ? 0.6 : 1, position: 'relative' }}>
            {isFetching && <CircularProgress size={16} sx={{ position: 'absolute', top: 8, right: 8 }} />}
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table
                size={TABLE_STYLES.size}
                sx={{
                  '& .MuiTableCell-root': {
                    borderBottom: TABLE_STYLES.cell.border,
                    py: TABLE_STYLES.cell.padding.py,
                    px: TABLE_STYLES.cell.padding.px,
                  },
                  '& .MuiTableBody-root .MuiTableRow-root:last-child .MuiTableCell-root': {
                    borderBottom: 'none',
                  },
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
                        letterSpacing: '0.5px',
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
                        letterSpacing: '0.5px',
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
                        letterSpacing: '0.5px',
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
                        letterSpacing: '0.5px',
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
                        letterSpacing: '0.5px',
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
                        letterSpacing: '0.5px',
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
                        letterSpacing: '0.5px',
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
                        letterSpacing: '0.5px',
                      }}>
                        Actions
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                        <Typography sx={{
                          color: "text.secondary"
                        }}>No users found</Typography>
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
                              opacity: 1,
                            },
                          },
                          transition: 'background-color 0.2s ease',
                          cursor: 'default',
                          height: TABLE_STYLES.row.height,
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
                                    height: 20,
                                  }}
                                />
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                            {(() => {
                              if (user.fullName && user.fullName !== 'null') return user.fullName
                              const firstName = user.firstName && user.firstName !== 'null' ? user.firstName : ''
                              const lastName = user.lastName && user.lastName !== 'null' ? user.lastName : ''
                              return `${firstName} ${lastName}`.trim()
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
                              fontWeight: 500,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusChip status={user.status} sx={{ fontSize: '0.65rem', height: 20, fontWeight: 500 }} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                            {formatDate(user.lastLoginAt)}
                          </Typography>
                          {user.lastLoginIp && (
                            <Typography
                              variant="caption"
                              sx={{
                                display: "block",
                                color: "text.secondary",
                                fontSize: '0.7rem'
                              }}>
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
                                fontWeight: 500,
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
                              transition: 'opacity 0.2s ease',
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
                                    color: 'primary.dark',
                                  },
                                }}
                              >
                                <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
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
                                      color: 'warning.dark',
                                    },
                                  }}
                                >
                                  <UnlockIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
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
                                    color: user.status === 'active' ? 'error.dark' : 'success.dark',
                                  },
                                  '&.Mui-disabled': {
                                    opacity: 0.3,
                                  },
                                }}
                              >
                                <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
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
          </Box>
        )}
        <TablePagination
          rowsPerPageOptions={PAGINATION.options}
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
    </GenericOverviewPage>
  );
}

export default UserManagementPage
