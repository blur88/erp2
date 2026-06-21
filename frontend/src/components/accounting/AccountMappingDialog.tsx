import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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
import { AppButton } from '@/components/common/AppButton'
import { useNotification } from '@/hooks/useNotification'
import {
  useCreateAccountMappingMutation,
  useGetChartOfAccountsQuery,
  useUpdateAccountMappingMutation,
} from '@/store/api/accountingApi'
import { getErrorMessage } from '@/utils/errorMessage'
import type { AccountMapping, CreateAccountMappingDto, UpdateAccountMappingDto } from '@/types/accountMapping'
import type { ChartOfAccount } from '@/types'

interface AccountMappingDialogProps {
  open: boolean
  onClose: () => void
  mapping?: AccountMapping
  mappingType?: string
  onSaveSuccess?: () => void
}

// Mapping type labels
const MAPPING_TYPE_LABELS: Record<string, string> = {
  sales_revenue: 'Sales Revenue',
  sales_ar: 'Accounts Receivable (Sales)',
  sales_cogs: 'Cost of Goods Sold',
  sales_inventory: 'Inventory (Sales)',
  purchase_inventory: 'Inventory (Purchases)',
  purchase_ap: 'Accounts Payable (Purchases)',
  payment_ar: 'Accounts Receivable (Payments)',
  vendor_payment_ap: 'Accounts Payable (Vendor Payments)',
  equity_owners_equity: "Owner's Equity",
  equity_drawings: 'Owner Drawings',
  inventory_asset: 'Inventory Asset',
  inventory_adjustment_gain: 'Inventory Adjustment Gain',
  inventory_adjustment_loss: 'Inventory Adjustment Loss',
}

const getMappingTypeLabel = (mappingType?: string): string => {
  if (!mappingType) return 'Unknown mapping'
  return MAPPING_TYPE_LABELS[mappingType] || mappingType
}

const AccountMappingDialog: React.FC<AccountMappingDialogProps> = ({
  open,
  onClose,
  mapping,
  mappingType,
  onSaveSuccess,
}) => {
  const { showError } = useNotification()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: accountsResponse, isLoading: loadingAccounts } = useGetChartOfAccountsQuery(
    {
      isActive: true,
      sortBy: 'code',
      sortOrder: 'ASC',
    },
    { skip: !open },
  )
  const [createAccountMapping] = useCreateAccountMappingMutation()
  const [updateAccountMapping] = useUpdateAccountMappingMutation()
  const accounts = (accountsResponse?.data ?? []) as ChartOfAccount[]

  const [formData, setFormData] = useState({
    accountId: '',
    description: '',
  })

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
        await updateAccountMapping({ id: mapping.id, data: updateData }).unwrap()
      } else if (mappingType) {
        // Create new mapping
        const createData: CreateAccountMappingDto = {
          mappingType,
          accountId: formData.accountId,
          description: formData.description || undefined,
        }
        await createAccountMapping(createData).unwrap()
      }

      if (onSaveSuccess) {
        onSaveSuccess()
      }
    } catch (err: any) {
      const errorMessage = getErrorMessage(err, 'Failed to save mapping')
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
                  <Typography variant="caption" gutterBottom sx={{
                    color: "text.secondary"
                  }}>
                    Selected Account Details
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {selectedAccount.fullCode} - {selectedAccount.name}
                  </Typography>
                  <Typography variant="body2" sx={{
                    color: "text.secondary"
                  }}>
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
          <AppButton variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </AppButton>
          <AppButton
            variant="primary"
            type="submit"
            disabled={submitting || loadingAccounts || !formData.accountId}
          >
            {submitting ? 'Saving...' : mapping ? 'Update' : 'Create'}
          </AppButton>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default AccountMappingDialog
