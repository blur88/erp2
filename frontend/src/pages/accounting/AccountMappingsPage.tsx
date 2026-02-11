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
  Alert,
  CircularProgress,
  IconButton,
  Chip,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Edit as EditIcon,
  Add as AddIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useNotification } from '@/hooks/useNotification'
import {
  fetchAccountMappings,
  validateAccountMappings,
  selectAccountMappings,
  selectAccountMappingsLoading,
  selectAccountMappingsError,
  selectAccountMappingsValid,
  selectAccountMappingsValidation,
} from '@/store/slices/accountMappingsSlice'
import { MappingType } from '@/types/accountMapping'
import type { AccountMapping } from '@/types/accountMapping'
import AccountMappingDialog from '@/components/accounting/AccountMappingDialog'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'

// Mapping type labels with category grouping
const MAPPING_TYPE_LABELS: Record<MappingType, { label: string; category: string; description: string }> = {
  [MappingType.SALES_REVENUE]: {
    label: 'Sales Revenue',
    category: 'Sales',
    description: 'Revenue account credited when sales orders are fulfilled'
  },
  [MappingType.SALES_AR]: {
    label: 'Accounts Receivable (Sales)',
    category: 'Sales',
    description: 'Asset account debited when sales orders are fulfilled'
  },
  [MappingType.SALES_COGS]: {
    label: 'Cost of Goods Sold',
    category: 'Sales',
    description: 'Expense account debited for product costs on sales'
  },
  [MappingType.SALES_INVENTORY]: {
    label: 'Inventory (Sales)',
    category: 'Sales',
    description: 'Asset account credited when inventory is sold'
  },
  [MappingType.PURCHASE_INVENTORY]: {
    label: 'Inventory (Purchases)',
    category: 'Purchasing',
    description: 'Asset account debited when goods are received'
  },
  [MappingType.PURCHASE_AP]: {
    label: 'Accounts Payable (Purchases)',
    category: 'Purchasing',
    description: 'Liability account credited when goods are received'
  },
  [MappingType.PAYMENT_CASH]: {
    label: 'Cash (Customer Payments)',
    category: 'Payments',
    description: 'Asset account debited when customer payments are received'
  },
  [MappingType.PAYMENT_AR]: {
    label: 'Accounts Receivable (Payments)',
    category: 'Payments',
    description: 'Asset account credited when customer payments are received'
  },
  [MappingType.VENDOR_PAYMENT_CASH]: {
    label: 'Cash (Vendor Payments)',
    category: 'Vendor Payments',
    description: 'Asset account credited when vendor payments are made'
  },
  [MappingType.VENDOR_PAYMENT_AP]: {
    label: 'Accounts Payable (Vendor Payments)',
    category: 'Vendor Payments',
    description: 'Liability account debited when vendor payments are made'
  },
  [MappingType.INVENTORY_ASSET]: {
    label: 'Inventory Asset',
    category: 'Inventory',
    description: 'Asset account for inventory adjustments'
  },
  [MappingType.INVENTORY_ADJUSTMENT_GAIN]: {
    label: 'Inventory Adjustment Gain',
    category: 'Inventory',
    description: 'Revenue account credited for positive inventory adjustments'
  },
  [MappingType.INVENTORY_ADJUSTMENT_LOSS]: {
    label: 'Inventory Adjustment Loss',
    category: 'Inventory',
    description: 'Expense account debited for negative inventory adjustments'
  },
}

const AccountMappingsPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const mappings = useAppSelector(selectAccountMappings)
  const loading = useAppSelector(selectAccountMappingsLoading)
  const error = useAppSelector(selectAccountMappingsError)
  const isValid = useAppSelector(selectAccountMappingsValid)
  const validationResult = useAppSelector(selectAccountMappingsValidation)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedMapping, setSelectedMapping] = useState<AccountMapping | null>(null)
  const [selectedMappingType, setSelectedMappingType] = useState<MappingType | null>(null)

  useKeyboardShortcuts({
    onRefresh: () => dispatch(fetchAccountMappings()),
  })

  // Load mappings and validate on mount
  useEffect(() => {
    dispatch(fetchAccountMappings())
    dispatch(validateAccountMappings())
  }, [dispatch])

  // Handle edit mapping
  const handleEdit = (mapping: AccountMapping) => {
    setSelectedMapping(mapping)
    setSelectedMappingType(null)
    setDialogOpen(true)
  }

  // Handle create mapping
  const handleCreate = (mappingType: MappingType) => {
    setSelectedMapping(null)
    setSelectedMappingType(mappingType)
    setDialogOpen(true)
  }

  // Handle dialog close
  const handleDialogClose = () => {
    setDialogOpen(false)
    setSelectedMapping(null)
    setSelectedMappingType(null)
  }

  // Handle dialog save success
  const handleSaveSuccess = () => {
    handleDialogClose()
    dispatch(fetchAccountMappings())
    dispatch(validateAccountMappings())
    showSuccess('Account mapping saved successfully')
  }

  // Get all mapping types in category order
  const getAllMappingTypes = (): Array<{ type: MappingType; label: string; category: string; description: string }> => {
    return Object.values(MappingType).map(type => ({
      type,
      ...MAPPING_TYPE_LABELS[type]
    }))
  }

  // Group by category for better organization
  const categories = ['Sales', 'Purchasing', 'Payments', 'Vendor Payments', 'Inventory']

  if (loading && mappings.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        mb: 4,
        gap: isMobile ? 2 : 0
      }}>
        <Box sx={{ mb: isMobile ? 2 : 0 }}>
          <Typography
            variant={isMobile ? TYPOGRAPHY_STYLES.pageHeader.mobileVariant : TYPOGRAPHY_STYLES.pageHeader.variant}
            sx={{
              fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
              mb: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 2
            }}
          >
            <SettingsIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Account Mappings Configuration
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Configure GL accounts for automatic journal entry posting
          </Typography>
        </Box>
      </Box>

      {/* Validation Status Alert */}
      {!isValid && validationResult && validationResult.missingMappings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight="bold" gutterBottom>
            Configuration Incomplete
          </Typography>
          <Typography variant="body2" gutterBottom>
            The following mappings are not configured:
          </Typography>
          <Box component="ul" sx={{ mt: 1, mb: 1, pl: 3 }}>
            {validationResult.missingMappings.map(type => (
              <li key={type}>
                <Typography variant="body2">
                  {MAPPING_TYPE_LABELS[type as MappingType]?.label || type}
                </Typography>
              </li>
            ))}
          </Box>
          <Typography variant="body2" sx={{ mt: 2, fontStyle: 'italic' }}>
            Auto-posting will not work until all required mappings are configured.
          </Typography>
        </Alert>
      )}

      {isValid && (
        <Alert severity="success" sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight="bold">
            All required account mappings are configured.
          </Typography>
          <Typography variant="body2">
            Auto-posting is enabled and journal entries will be created automatically for transactions.
          </Typography>
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => dispatch(fetchAccountMappings())}>
              Retry
            </Button>
          }
          sx={{ mb: 3 }}
        >
          {error}
        </Alert>
      )}

      {/* Info Alert */}
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2" fontWeight="bold" gutterBottom>
          About Account Mappings
        </Typography>
        <Typography variant="body2">
          Account mappings define which GL accounts are used when the system automatically posts journal entries
          for business transactions (sales, purchases, payments, etc.). Each transaction type requires specific
          accounts to ensure proper accounting records.
        </Typography>
      </Alert>

      {/* Mappings Table */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
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
                  <TableCell>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Category
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Mapping Type
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Assigned Account
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Description
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right">
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Actions
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {categories.map(category => {
                  const categoryMappings = getAllMappingTypes().filter(m => m.category === category)
                  return categoryMappings.map((mappingInfo, index) => {
                    const mapping = mappings.find(m => m.mappingType === mappingInfo.type)
                    const isFirstInCategory = index === 0

                    return (
                      <TableRow
                        key={mappingInfo.type}
                        hover
                        sx={{
                          '&:hover': {
                            backgroundColor: 'action.hover',
                          },
                          transition: 'background-color 0.2s ease',
                          height: TABLE_STYLES.row.height,
                          backgroundColor: !mapping ? 'warning.light' : 'inherit',
                          opacity: !mapping ? 0.7 : 1,
                        }}
                      >
                        <TableCell>
                          {isFirstInCategory && (
                            <Chip
                              label={category}
                              size="small"
                              color="primary"
                              variant="outlined"
                              sx={{ fontSize: '0.7rem', fontWeight: 500 }}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                            {mappingInfo.label}
                          </Typography>
                          {isMobile && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', display: 'block', mt: 0.5 }}>
                              {mappingInfo.description}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {mapping ? (
                            <Box>
                              <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                                {mapping.account?.code} - {mapping.account?.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                {mapping.account?.accountType}
                              </Typography>
                            </Box>
                          ) : (
                            <Chip
                              label="Not configured"
                              size="small"
                              color="warning"
                              sx={{ fontSize: '0.7rem' }}
                            />
                          )}
                        </TableCell>
                        {!isMobile && (
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                              {mapping?.description || mappingInfo.description}
                            </Typography>
                          </TableCell>
                        )}
                        <TableCell align="right">
                          {mapping ? (
                            <IconButton
                              size="small"
                              onClick={() => handleEdit(mapping)}
                              sx={{
                                height: `${TABLE_STYLES.row.height * 0.75}px`,
                                width: `${TABLE_STYLES.row.height * 0.75}px`,
                                color: 'primary.main',
                                '&:hover': {
                                  backgroundColor: 'primary.light',
                                  color: 'primary.dark'
                                }
                              }}
                            >
                              <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
                            </IconButton>
                          ) : (
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<AddIcon />}
                              onClick={() => handleCreate(mappingInfo.type)}
                              sx={{ fontSize: '0.75rem' }}
                            >
                              Configure
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Account Mapping Dialog */}
      <AccountMappingDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        mapping={selectedMapping || undefined}
        mappingType={selectedMappingType || undefined}
        onSaveSuccess={handleSaveSuccess}
      />
    </Box>
  )
}

export default AccountMappingsPage
