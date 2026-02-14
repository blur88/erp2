import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material'
import { useAppDispatch } from '@/hooks/useRedux'
import { useNotification } from '@/hooks/useNotification'
import {
  createAccountMapping,
  updateAccountMapping,
} from '@/store/slices/accountMappingsSlice'
import { chartOfAccountsApi } from '@/services/accountingApi'
import type { AccountMapping, MappingType, CreateAccountMappingDto, UpdateAccountMappingDto } from '@/types/accountMapping'
import type { ChartOfAccount } from '@/types'

interface AccountMappingDialogProps {
  open: boolean
  onClose: () => void
  mapping?: AccountMapping
  mappingType?: string
  onSaveSuccess?: () => void
}

// Mapping type labels
const MAPPING_TYPE_LABELS: Record<MappingType, string> = {
  sales_revenue: 'Sales Revenue',
  sales_ar: 'Accounts Receivable (Sales)',
  sales_cogs: 'Cost of Goods Sold',
  sales_inventory: 'Inventory (Sales)',
  purchase_inventory: 'Inventory (Purchases)',
  purchase_ap: 'Accounts Payable (Purchases)',
  payment_cash: 'Cash (Customer Payments)',
  payment_ar: 'Accounts Receivable (Payments)',
  vendor_payment_cash: 'Cash (Vendor Payments)',
  vendor_payment_ap: 'Accounts Payable (Vendor Payments)',
  inventory_asset: 'Inventory Asset',
  inventory_adjustment_gain: 'Inventory Adjustment Gain',
  inventory_adjustment_loss: 'Inventory Adjustment Loss',
}

const getMappingTypeLabel = (mappingType?: string): string => {
  if (!mappingType) return 'Unknown mapping'
  return MAPPING_TYPE_LABELS[mappingType as MappingType] || mappingType
}

const AccountMappingDialog: React.FC<AccountMappingDialogProps> = ({
  open,
  onClose,
  mapping,
  mappingType,
  onSaveSuccess,
}) => {
  const dispatch = useAppDispatch()
  const { showError } = useNotification()

  const [accounts, setAccounts] = useState<ChartOfAccount[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    accountId: '',
    description: '',
  })

  // Load accounts on mount
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        setLoadingAccounts(true)
        const response = await chartOfAccountsApi.getAll({
          page: 1,
          limit: 100,
          isActive: true,
          sortBy: 'code',
          sortOrder: 'ASC',
        })
        setAccounts(response.data || [])
      } catch (err: any) {
        console.error('Failed to load accounts:', err)
        showError('Failed to load chart of accounts')
      } finally {
        setLoadingAccounts(false)
      }
    }

    if (open) {
      loadAccounts()
    }
  }, [open, showError])

  // Initialize form data when mapping changes
  useEffect(() => {
    if (mapping) {
      setFormData({
        accountId: mapping.accountId || '',
        description: mapping.description || '',
      })
    } else {
      setFormData({
        accountId: '',
        description: '',
      })
    }
    setError(null)
  }, [mapping, open])

  // Handle form field changes
  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    setError(null)
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.accountId) {
      setError('Please select an account')
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      if (mapping) {
        // Update existing mapping
        const updateData: UpdateAccountMappingDto = {
          accountId: formData.accountId,
          description: formData.description || undefined,
        }
        await dispatch(updateAccountMapping({ id: mapping.id, data: updateData })).unwrap()
      } else if (mappingType) {
        // Create new mapping
        const createData: CreateAccountMappingDto = {
          mappingType,
          accountId: formData.accountId,
          description: formData.description || undefined,
        }
        await dispatch(createAccountMapping(createData)).unwrap()
      }

      if (onSaveSuccess) {
        onSaveSuccess()
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to save mapping'
      setError(errorMessage)
      showError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  // Get dialog title
  const getDialogTitle = () => {
    if (mapping) {
      return `Edit Account Mapping: ${getMappingTypeLabel(mapping.mappingType)}`
    }
    if (mappingType) {
      return `Configure Account Mapping: ${getMappingTypeLabel(mappingType)}`
    }
    return 'Account Mapping'
  }

  // Get selected account details
  const selectedAccount = accounts.find(a => a.id === formData.accountId)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{getDialogTitle()}</DialogTitle>

        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loadingAccounts ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
              {/* Mapping Type (read-only) */}
              <TextField
                label="Mapping Type"
                value={getMappingTypeLabel(mapping?.mappingType || mappingType)}
                disabled
                fullWidth
              />

              {/* Account Selection */}
              <FormControl fullWidth required>
                <InputLabel>GL Account</InputLabel>
                <Select
                  value={formData.accountId}
                  onChange={(e) => handleChange('accountId', e.target.value)}
                  label="GL Account"
                >
                  <MenuItem value="">
                    <em>Select an account</em>
                  </MenuItem>
                  {accounts.map(account => (
                    <MenuItem key={account.id} value={account.id}>
                      {account.fullCode} - {account.name} ({account.type})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Selected Account Info */}
              {selectedAccount && (
                <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary" gutterBottom>
                    Selected Account Details
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {selectedAccount.fullCode} - {selectedAccount.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Type: {selectedAccount.type}
                  </Typography>
                </Box>
              )}

              {/* Description */}
              <TextField
                label="Description (Optional)"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                fullWidth
                multiline
                rows={3}
                placeholder="Enter a custom description for this mapping"
                helperText="Optional custom description. If left blank, default description will be used."
              />
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting || loadingAccounts || !formData.accountId}
          >
            {submitting ? 'Saving...' : mapping ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default AccountMappingDialog
