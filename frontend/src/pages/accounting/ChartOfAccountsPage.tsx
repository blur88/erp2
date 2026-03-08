import React, { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  CircularProgress,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useTheme,
  useMediaQuery,
  Collapse,
  Grid,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  AccountBalance as AccountIcon,
  CloudUpload as SeedIcon,
  Restore as RestoreIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import { useNotification } from '@/hooks/useNotification'
import { useSearchAndFilter, useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import ChartOfAccountFormDialog from '@/components/accounting/ChartOfAccountFormDialog'
import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import DeletedAccountsDialog from '@/components/accounting/DeletedAccountsDialog'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import {
  useDeleteChartOfAccountMutation,
  useGetChartOfAccountsQuery,
  useSeedDefaultChartOfAccountsMutation,
} from '@/store/api/accountingApi'
import type { ChartOfAccount } from '@/types'

const ChartOfAccountsPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<ChartOfAccount | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [accountToDelete, setAccountToDelete] = useState<ChartOfAccount | null>(null)
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false)
  const [deletedDialogOpen, setDeletedDialogOpen] = useState(false)
  const [codeGuideOpen, setCodeGuideOpen] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [activeFilter, setActiveFilter] = useState<string>('active')

  // Search functionality
  const { focusSearchInput } = useSearchAndFilter({
    initialSearchTerm: '',
    onSearchChange: () => {},
  })

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSearch: focusSearchInput,
  })
  const queryParams: Record<string, unknown> = { page: 1 }
  if (searchTerm) queryParams.search = searchTerm
  if (typeFilter !== 'all') queryParams.type = typeFilter
  if (activeFilter === 'active') queryParams.isActive = true
  else if (activeFilter === 'inactive') queryParams.isActive = false
  const {
    data: accountsResponse,
    isLoading: loading,
    error,
    refetch,
  } = useGetChartOfAccountsQuery(queryParams)
  const [deleteChartOfAccount] = useDeleteChartOfAccountMutation()
  const [seedDefaultChartOfAccounts] = useSeedDefaultChartOfAccountsMutation()
  const accounts = accountsResponse?.data ?? []
  const pagination = accountsResponse?.meta
  const errorMessage = (error as any)?.data ?? null

  useEffect(() => {
    if (errorMessage) {
      showError(errorMessage)
    }
  }, [errorMessage, showError])

  const handleAddAccount = () => {
    setSelectedAccount(null)
    setFormDialogOpen(true)
  }

  const handleEditAccount = (account: ChartOfAccount) => {
    setSelectedAccount(account)
    setFormDialogOpen(true)
  }

  const handleDeleteAccount = (account: ChartOfAccount) => {
    setAccountToDelete(account)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!accountToDelete) return

    try {
      await deleteChartOfAccount(accountToDelete.id).unwrap()
      showSuccess(`Account "${accountToDelete.name}" deleted successfully`)
      setDeleteConfirmOpen(false)
      setAccountToDelete(null)
      refetch()
    } catch (error: any) {
      showError(error || 'Failed to delete account')
    }
  }

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setAccountToDelete(null)
  }

  const handleFormClose = () => {
    setFormDialogOpen(false)
    setSelectedAccount(null)
  }

  const handleFormSuccess = () => {
    setFormDialogOpen(false)
    setSelectedAccount(null)
    refetch()
  }

  const handleSeedAccounts = () => {
    setSeedConfirmOpen(true)
  }

  const handleConfirmSeed = async () => {
    try {
      const result = await seedDefaultChartOfAccounts().unwrap()
      showSuccess(result.message || 'Default accounts seeded successfully')
      setSeedConfirmOpen(false)
      refetch()
    } catch (error: any) {
      showError(error || 'Failed to seed default accounts')
      setSeedConfirmOpen(false)
    }
  }

  const handleCancelSeed = () => {
    setSeedConfirmOpen(false)
  }

  const getAccountTypeBadgeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'asset':
        return 'success'
      case 'liability':
        return 'error'
      case 'equity':
        return 'primary'
      case 'revenue':
        return 'info'
      case 'expense':
        return 'warning'
      default:
        return 'default'
    }
  }

  const getAccountTypeLabel = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
  }

  const calculateIndentLevel = (account: ChartOfAccount): number => {
    if (!account.parentId) return 0

    const parent = accounts.find(a => a.id === account.parentId)
    if (!parent) return 0

    return calculateIndentLevel(parent) + 1
  }

  const findParentName = (parentId?: string): string => {
    if (!parentId) return '-'
    const parent = accounts.find(a => a.id === parentId)
    return parent ? parent.name : '-'
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Account Mapping Warning */}
      <AccountMappingWarning context="system" />

      {/* Header */}
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        mb: 3,
        gap: isMobile ? 2 : 0
      }}>
        <Box sx={{ mb: isMobile ? 2 : 0 }}>
          <Typography variant={isMobile ? TYPOGRAPHY_STYLES.pageHeader.mobileVariant : TYPOGRAPHY_STYLES.pageHeader.variant} sx={{
            fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2
          }}>
            <AccountIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Chart of Accounts
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage your accounting structure and account hierarchy ({pagination?.total || 0} total)
          </Typography>
        </Box>
        <Box sx={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 1.5 : 1,
          alignItems: isMobile ? 'stretch' : 'center'
        }}>
          {accounts.length === 0 && !loading && (
            <Button
              variant="outlined"
              startIcon={!isMobile ? <SeedIcon /> : undefined}
              onClick={handleSeedAccounts}
              size="medium"
              fullWidth={isMobile}
              sx={{
                color: 'info.main',
                borderColor: 'info.main',
                '&:hover': {
                  borderColor: 'info.dark',
                  backgroundColor: 'info.light'
                }
              }}
            >
              {isMobile ? "Seed Default Accounts" : "Seed Defaults"}
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={!isMobile ? <RestoreIcon /> : undefined}
            onClick={() => setDeletedDialogOpen(true)}
            size="medium"
            fullWidth={isMobile}
            sx={{
              color: 'warning.main',
              borderColor: 'warning.main',
              '&:hover': {
                borderColor: 'warning.dark',
                backgroundColor: 'warning.lighter'
              }
            }}
          >
            {isMobile ? "View Deleted" : "View Deleted"}
          </Button>
          <Button
            variant="contained"
            startIcon={!isMobile ? <AddIcon /> : undefined}
            size="medium"
            onClick={handleAddAccount}
            fullWidth={isMobile}
          >
            {isMobile ? "Add New Account" : "Add Account"}
          </Button>
        </Box>
      </Box>

      {/* Code Range Guide */}
      <Paper variant="outlined" sx={{ mb: 3, borderColor: 'info.light' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.25,
            cursor: 'pointer',
            '&:hover': { backgroundColor: 'action.hover' },
            borderRadius: 1,
          }}
          onClick={() => setCodeGuideOpen(prev => !prev)}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InfoIcon sx={{ fontSize: 18, color: 'info.main' }} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'info.main' }}>
              Account Code Reference
            </Typography>
            <Typography variant="caption" color="text.secondary">
              — click to {codeGuideOpen ? 'hide' : 'show'} code range guide
            </Typography>
          </Box>
        </Box>
        <Collapse in={codeGuideOpen}>
          <Box sx={{ px: 2, pb: 2 }}>
            <Grid container spacing={1.5}>
              {[
                {
                  range: '1000 – 1999',
                  label: 'Assets',
                  desc: 'Cash, bank accounts, receivables, inventory, fixed assets',
                  color: 'success' as const,
                },
                {
                  range: '2000 – 2999',
                  label: 'Liabilities',
                  desc: 'Accounts payable, loans, credit cards, accrued expenses',
                  color: 'error' as const,
                },
                {
                  range: '3000 – 3999',
                  label: 'Equity',
                  desc: "Owner's equity, retained earnings, dividends",
                  color: 'primary' as const,
                },
                {
                  range: '4000 – 4999',
                  label: 'Revenue',
                  desc: 'Sales revenue, service income, other income — shown in P&L Revenue section',
                  color: 'info' as const,
                },
                {
                  range: '5000 – 5999',
                  label: 'Cost of Goods Sold (COGS)',
                  desc: 'Direct costs: COGS, inventory cost — shown in P&L COGS section',
                  color: 'warning' as const,
                },
                {
                  range: '6000+',
                  label: 'Operating Expenses',
                  desc: 'Salaries, rent, utilities, marketing, admin — shown in P&L Operating Expenses section',
                  color: 'warning' as const,
                },
              ].map(({ range, label, desc, color }) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={range}>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      border: 1,
                      borderColor: `${color}.light`,
                      backgroundColor: `${color}.50`,
                      height: '100%',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: `${color}.dark`,
                          backgroundColor: `${color}.100`,
                          px: 0.75,
                          py: 0.25,
                          borderRadius: 0.5,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {range}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: `${color}.dark` }}>
                        {label}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {desc}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Box>
        </Collapse>
      </Paper>

      {/* Filters and Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 2 : 1,
        alignItems: isMobile ? 'stretch' : 'center',
        '& > *': {
          alignSelf: isMobile ? 'stretch' : 'flex-start'
        }
      }}>
        <TextField
          placeholder="Search by code or name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
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
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize
              }
            },
            '& .MuiInputAdornment-root': {
              '& .MuiSvgIcon-root': {
                fontSize: TYPOGRAPHY_STYLES.searchField.icon.fontSize,
                color: TYPOGRAPHY_STYLES.searchField.icon.color
              }
            }
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        <FormControl
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 150,
            flex: 'none'
          }}
        >
          <InputLabel
            sx={{
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              '&.MuiInputLabel-shrunk': {
                fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize
              }
            }}
          >
            Account Type
          </InputLabel>
          <Select
            value={typeFilter}
            label="Account Type"
            onChange={(e) => setTypeFilter(e.target.value)}
            sx={{
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
            }}
          >
            <MenuItem value="all">All Types</MenuItem>
            <MenuItem value="asset">Asset</MenuItem>
            <MenuItem value="liability">Liability</MenuItem>
            <MenuItem value="equity">Equity</MenuItem>
            <MenuItem value="revenue">Revenue</MenuItem>
            <MenuItem value="expense">Expense</MenuItem>
          </Select>
        </FormControl>

        <FormControl
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 120,
            flex: 'none'
          }}
        >
          <InputLabel
            sx={{
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              '&.MuiInputLabel-shrunk': {
                fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize
              }
            }}
          >
            Status
          </InputLabel>
          <Select
            value={activeFilter}
            label="Status"
            onChange={(e) => setActiveFilter(e.target.value)}
            sx={{
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
            }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
          </Select>
        </FormControl>
      </Box>
      </Paper>

      {/* Accounts Table */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : accounts.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              No accounts found. {searchTerm || typeFilter !== 'all' ? 'Try adjusting your filters.' : 'Seed default accounts to get started.'}
            </Typography>
            {!searchTerm && typeFilter === 'all' && (
              <Button
                variant="contained"
                startIcon={<SeedIcon />}
                onClick={handleSeedAccounts}
              >
                Seed Default Accounts
              </Button>
            )}
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table
              size={TABLE_STYLES.size}
              sx={{
                minWidth: isMobile ? 650 : 800,
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
                  <TableCell sx={{ width: '15%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Code
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: '30%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Account Name
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: '15%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Type
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: '20%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Parent Account
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: '10%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Status
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ width: '10%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Actions
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {accounts.map((account) => {
                  const indentLevel = calculateIndentLevel(account)
                  const isSystemAccount = (account as ChartOfAccount & { isSystemAccount?: boolean }).isSystemAccount ?? false
                  return (
                    <TableRow
                      key={account.id}
                      hover
                      sx={{
                        '&:hover': {
                          backgroundColor: 'action.hover',
                          '& .account-actions': {
                            opacity: 1
                          }
                        },
                        transition: 'background-color 0.2s ease',
                        height: TABLE_STYLES.row.height
                      }}
                    >
                      <TableCell>
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{
                          fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                          fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                        }}>
                          {account.code}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{
                          display: 'flex',
                          alignItems: 'center',
                          pl: indentLevel * 2
                        }}>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} sx={{
                            fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize,
                            lineHeight: TYPOGRAPHY_STYLES.tableCell.secondary.lineHeight,
                            fontWeight: indentLevel === 0 ? 600 : 400,
                          }}>
                            {account.name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getAccountTypeLabel(account.type)}
                          size="small"
                          color={getAccountTypeBadgeColor(account.type) as any}
                          sx={{
                            fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                            fontWeight: 500,
                            height: `${TABLE_STYLES.row.height * 0.65}px`,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary" sx={{
                          fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize
                        }}>
                          {findParentName(account.parentId)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={account.isActive ? 'Active' : 'Inactive'}
                          size="small"
                          color={account.isActive ? 'success' : 'default'}
                          variant="outlined"
                          sx={{
                            fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                            fontWeight: 500,
                            height: `${TABLE_STYLES.row.height * 0.65}px`,
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Box
                          className="account-actions"
                          sx={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            gap: 0.25,
                            opacity: isMobile ? 1 : 0.7,
                            transition: 'opacity 0.2s ease'
                          }}
                        >
                          <IconButton
                            size="small"
                            title={`Edit ${account.name}`}
                            aria-label={`Edit account ${account.name}`}
                            onClick={() => handleEditAccount(account)}
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
                          <IconButton
                            size="small"
                            title={`Delete ${account.name}`}
                            aria-label={`Delete account ${account.name}`}
                            onClick={() => handleDeleteAccount(account)}
                            disabled={isSystemAccount}
                            sx={{
                              height: `${TABLE_STYLES.row.height * 0.75}px`,
                              width: `${TABLE_STYLES.row.height * 0.75}px`,
                              minHeight: 20,
                              minWidth: 20,
                              p: 0.125,
                              color: isSystemAccount ? 'text.disabled' : 'error.main',
                              '&:hover': {
                                backgroundColor: isSystemAccount ? 'transparent' : 'error.light',
                                color: isSystemAccount ? 'text.disabled' : 'error.dark'
                              }
                            }}
                          >
                            <DeleteIcon sx={{
                              fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                            }} />
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Form Dialog */}
      <ChartOfAccountFormDialog
        open={formDialogOpen}
        account={selectedAccount}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete the account "${accountToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        severity="error"
      />

      {/* Seed Confirmation Dialog */}
      <ConfirmationDialog
        open={seedConfirmOpen}
        title="Seed Default Accounts"
        message="This will create a standard chart of accounts with common account types. Are you sure you want to proceed?"
        confirmText="Seed Accounts"
        cancelText="Cancel"
        onConfirm={handleConfirmSeed}
        onCancel={handleCancelSeed}
        severity="info"
      />

      {/* Deleted Accounts Dialog */}
      <DeletedAccountsDialog
        open={deletedDialogOpen}
        onClose={() => setDeletedDialogOpen(false)}
        onChanged={() => refetch()}
      />
    </Box>
  )
}

export default ChartOfAccountsPage
