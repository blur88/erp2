import React from 'react'
import { Box, Button, Chip, Typography } from '@mui/material'
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

import type { Customer } from '@/types'
import { CustomerType } from '@/types'

interface CustomerContextHeaderProps {
  selectedCustomer: Customer | null
  onDelete: () => void
}

const CustomerContextHeader: React.FC<CustomerContextHeaderProps> = ({
  selectedCustomer,
  onDelete,
}) => {
  const navigate = useNavigate()

  if (!selectedCustomer) {
    return (
      <Box sx={{ p: 2, color: 'text.secondary' }}>
        <Typography variant="body2">Select a customer from the list</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6" fontWeight={600} noWrap>
          {selectedCustomer.name}
        </Typography>
        <Chip
          label={selectedCustomer.type === CustomerType.BUSINESS ? 'Business' : 'Individual'}
          size="small"
          variant="outlined"
        />
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<EditIcon />}
          onClick={() => navigate(`/sales/customers/${selectedCustomer.id}/edit`)}
        >
          Edit
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={onDelete}
        >
          Delete
        </Button>
      </Box>
    </Box>
  )
}

export default CustomerContextHeader
