import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertTitle, Typography, Button } from '@mui/material'
import { useValidateAccountMappingsQuery } from '@/store/api/accountingApi'
import { MappingType } from '@/types/accountMapping'

interface AccountMappingWarningProps {
  context?: 'transaction' | 'system'
  action?: string
}

// Mapping type labels for display
const MAPPING_TYPE_LABELS: Record<string, { label: string; description: string }> = {
  [MappingType.SALES_REVENUE]: { label: 'Sales Revenue', description: 'Revenue from sales' },
  [MappingType.SALES_AR]: { label: 'Sales - Accounts Receivable', description: 'Customer receivables' },
  [MappingType.SALES_COGS]: { label: 'Sales - Cost of Goods Sold', description: 'Cost of goods sold' },
  [MappingType.SALES_INVENTORY]: { label: 'Sales - Inventory', description: 'Inventory reduction' },
  [MappingType.PURCHASE_INVENTORY]: { label: 'Purchase - Inventory', description: 'Inventory increase' },
  [MappingType.PURCHASE_AP]: { label: 'Purchase - Accounts Payable', description: 'Supplier payables' },
  [MappingType.PAYMENT_AR]: { label: 'Payment - Accounts Receivable', description: 'AR reduction' },
  [MappingType.VENDOR_PAYMENT_AP]: { label: 'Vendor Payment - Accounts Payable', description: 'AP reduction' },
  [MappingType.INVENTORY_ASSET]: { label: 'Inventory - Asset', description: 'Inventory asset account' },
  [MappingType.INVENTORY_ADJUSTMENT_GAIN]: {
    label: 'Inventory Adjustment - Gain',
    description: 'Inventory gains',
  },
  [MappingType.INVENTORY_ADJUSTMENT_LOSS]: {
    label: 'Inventory Adjustment - Loss',
    description: 'Inventory losses',
  },
}

const AccountMappingWarning: React.FC<AccountMappingWarningProps> = ({
  context = 'transaction',
  action = 'complete this operation',
}) => {
  const navigate = useNavigate()
  const { data: validationResult } = useValidateAccountMappingsQuery()
  const isValid = validationResult?.isValid ?? false

  if (isValid) return null

  if (context === 'system') {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        <AlertTitle>Account Mappings Not Configured</AlertTitle>
        <Typography variant="body2" gutterBottom>
          Auto-posting is disabled. The following account mappings are missing:
        </Typography>
        {validationResult && validationResult.missingMappings.length > 0 && (
          <ul style={{ marginTop: 8, marginBottom: 8, paddingLeft: 20 }}>
            {validationResult.missingMappings.map((type) => (
              <li key={type}>
                <Typography variant="body2" component="span">
                  {MAPPING_TYPE_LABELS[type]?.label || type}
                </Typography>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="contained"
          size="small"
          onClick={() => navigate('/accounting/account-mappings')}
          sx={{ mt: 1 }}
        >
          Configure Account Mappings
        </Button>
      </Alert>
    )
  }

  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      <Typography variant="body2">
        You can {action}, but accounting entry will not be created automatically. Account mappings
        need to be configured.
      </Typography>
    </Alert>
  )
}

export default AccountMappingWarning
