import React, { useState, useMemo } from 'react'
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
  Tooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Edit as EditIcon,
  Add as AddIcon,
  Clear as ClearIcon,
} from '@mui/icons-material'
import { useNotification } from '@/hooks/useNotification'
import {
  useDeleteAccountMappingMutation,
  useGetAccountMappingsQuery,
  useGetPaymentMethodsQuery,
  useValidateAccountMappingsQuery,
} from '@/store/api/accountingApi'
import { MappingType } from '@/types/accountMapping'
import type { AccountMapping } from '@/types/accountMapping'
import AccountMappingDialog from '@/components/accounting/AccountMappingDialog'
import PageHeader from '@/components/common/PageHeader'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { TABLE_STYLES } from '@/constants/tableStyles'
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
  [MappingType.PAYMENT_AR]: {
    label: 'Accounts Receivable (Payments)',
    category: 'Payments',
    description: 'Asset account credited when customer payments are received'
  },
  [MappingType.VENDOR_PAYMENT_AP]: {
    label: 'Accounts Payable (Vendor Payments)',
    category: 'Vendor Payments',
    description: 'Liability account debited when vendor payments are made'
  },
  [MappingType.EQUITY_OWNERS_EQUITY]: {
    label: "Owner's Equity",
    category: 'Equity',
    description: "Equity account credited for owner capital contributions"
  },
  [MappingType.EQUITY_DRAWINGS]: {
    label: 'Owner Drawings',
    category: 'Equity',
    description: 'Equity contra account debited for owner withdrawals'
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

const getMappingLabel = (mappingType: string): string =>
  MAPPING_TYPE_LABELS[mappingType as MappingType]?.label || mappingType

const AccountMappingsPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const {
    data: mappings = [],
    isLoading: mappingsLoading,
    error: mappingsError,
    refetch: refetchMappings,
  } = useGetAccountMappingsQuery()
  const {
    data: validationResult,
    refetch: refetchValidation,
  } = useValidateAccountMappingsQuery()
  const { data: paymentMethodsResponse } = useGetPaymentMethodsQuery({ page: 1, isActive: true })
  const [deleteAccountMapping] = useDeleteAccountMappingMutation()
  const isValid = validationResult?.isValid ?? false
  const loading = mappingsLoading
  const error = (mappingsError as any)?.data ?? null

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedMapping, setSelectedMapping] = useState<AccountMapping | null>(null)
  const [selectedMappingType, setSelectedMappingType] = useState<string | null>(null)
  const [mappingToClear, setMappingToClear] = useState<AccountMapping | null>(null)
  const [clearing, setClearing] = useState(false)
  const paymentMethods = useMemo(
    () => ((paymentMethodsResponse?.data ?? []) as Array<{ code: string; name: string; requiresSettlement: boolean; useForPurchases: boolean }>),
    [paymentMethodsResponse],
  )

  useKeyboardShortcuts({
    onRefresh: () => {
      refetchMappings()
      refetchValidation()
    },
  })

  // Handle edit mapping
  const handleEdit = (mapping: AccountMapping) => {
    setSelectedMapping(mapping)
    setSelectedMappingType(null)
    setDialogOpen(true)
  }

  // Handle create mapping
  const handleCreate = (mappingType: string) => {
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
    refetchMappings()
    refetchValidation()
    showSuccess('Account mapping saved successfully')
  }

  const handleClearClick = (mapping: AccountMapping) => {
    setMappingToClear(mapping)
  }

  const handleClearConfirm = async () => {
    if (!mappingToClear) return

    try {
      setClearing(true)
      await deleteAccountMapping(mappingToClear.id).unwrap()
      await refetchMappings()
      await refetchValidation()
      showSuccess(`Mapping "${getMappingLabel(mappingToClear.mappingType)}" cleared successfully`)
    } catch (err: any) {
      showError(err || 'Failed to clear mapping')
    } finally {
      setClearing(false)
      setMappingToClear(null)
    }
  }

  // Get all mapping types in category order
  const getAllMappingTypes = (): Array<{ type: string; label: string; category: string; description: string }> => {
    return Object.values(MappingType).map(type => ({
      type,
      ...MAPPING_TYPE_LABELS[type]
    }))
  }

  const getPaymentMappingTypes = (): Array<{ type: string; label: string; category: string; description: string }> => {
    const items: Array<{ type: string; label: string; category: string; description: string }> = [
      {
        type: MappingType.PAYMENT_AR,
        label: 'Accounts Receivable (Payments)',
        category: 'Payments',
        description: 'Asset account credited when customer payments are received',
      },
    ]

    for (const pm of paymentMethods) {
      const code = pm.code.toLowerCase()
      items.push({
        type: `payment_${code}`,
        label: `${pm.name} Payment Account`,
        category: 'Payments',
        description: `Account debited when ${pm.name} payments are received`,
      })
      if (pm.requiresSettlement) {
        items.push({
          type: `payment_${code}_settlement`,
          label: `${pm.name} Settlement Account`,
          category: 'Payments',
          description: `Bank account debited when ${pm.name} payments are settled`,
        })
      }
    }

    return items
  }

  const getVendorPaymentMappingTypes = (): Array<{ type: string; label: string; category: string; description: string }> => {
    const items: Array<{ type: string; label: string; category: string; description: string }> = [
      {
        type: MappingType.VENDOR_PAYMENT_AP,
        label: 'Accounts Payable (Vendor Payments)',
        category: 'Vendor Payments',
        description: 'Liability account debited when vendor payments are made',
      },
    ]

    for (const pm of paymentMethods) {
      if (!pm.useForPurchases) continue
      const code = pm.code.toLowerCase()
      items.push({
        type: `vendor_payment_${code}`,
        label: `${pm.name} Vendor Payment Account`,
        category: 'Vendor Payments',
        description: `Account credited when ${pm.name} vendor payments are made`,
      })
    }

    return items
  }

  // Memoize mapping generation to avoid unnecessary recalculations
  const staticCategories = ['Sales', 'Purchasing', 'Equity', 'Inventory']

  // Recalculate sections whenever paymentMethods changes
  const allSections = useMemo(() => [
    ...staticCategories.map((category) => ({
      category,
      items: getAllMappingTypes().filter((m) => m.category === category),
    })),
    { category: 'Payments', items: getPaymentMappingTypes() },
    { category: 'Vendor Payments', items: getVendorPaymentMappingTypes() },
  ], [paymentMethods])

  if (loading && mappings.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Account Mappings"
        subtitle="Configure default account assignments for transactions"
      />

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
            <Button color="inherit" size="small" onClick={() => refetchMappings()}>
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
                <TableRow sx={{
                  '& .MuiTableCell-head': {
                    fontWeight: 600,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    py: 1
                  }
                }}>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Category
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Mapping Type
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Assigned Account
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Description
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right">
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Actions
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {allSections.map(({ category, items }) => {
                  return items.map((mappingInfo, index) => {
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
                          backgroundColor: !mapping
                            ? 'rgba(255, 152, 0, 0.15)'
                            : 'inherit',
                          opacity: !mapping ? 0.85 : 1,
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
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {mapping?.description || mappingInfo.description}
                            </Typography>
                          </TableCell>
                        )}
                        <TableCell align="right">
                          {mapping ? (
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                              <Tooltip title="Edit mapping">
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
                              </Tooltip>
                              <Tooltip title="Clear mapping">
                                <IconButton
                                  size="small"
                                  aria-label="clear"
                                  onClick={() => handleClearClick(mapping)}
                                  sx={{
                                    height: `${TABLE_STYLES.row.height * 0.75}px`,
                                    width: `${TABLE_STYLES.row.height * 0.75}px`,
                                    color: 'error.main',
                                    '&:hover': {
                                      backgroundColor: 'error.light',
                                      color: 'error.dark'
                                    }
                                  }}
                                >
                                  <ClearIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
                                </IconButton>
                              </Tooltip>
                            </Box>
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

      <ConfirmationDialog
        open={!!mappingToClear}
        title="Clear Account Mapping"
        message={
          mappingToClear
            ? `Are you sure you want to clear "${getMappingLabel(mappingToClear.mappingType)}"? Auto-posting for this mapping will remain disabled until reconfigured.`
            : ''
        }
        confirmText={clearing ? 'Clearing...' : 'Clear'}
        onConfirm={handleClearConfirm}
        onCancel={() => !clearing && setMappingToClear(null)}
        severity="warning"
        loading={clearing}
      />
    </Box>
  )
}

export default AccountMappingsPage
