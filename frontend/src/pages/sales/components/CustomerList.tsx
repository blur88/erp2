import React from 'react'
import { Box, List, ListItemButton, ListItemText, Typography } from '@mui/material'

import { ListSkeleton } from '@/components/common/ListSkeleton'
import type { Customer } from '@/types'

interface CustomerListProps {
  customers: Customer[]
  loading: boolean
  selectedCustomerId: string | undefined
  focusedIndex: number
  onSelect: (customer: Customer) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

const CustomerList: React.FC<CustomerListProps> = ({
  customers,
  loading,
  selectedCustomerId,
  focusedIndex,
  onSelect,
  listRef,
}) => {
  if (loading) {
    return <ListSkeleton rows={10} columns={1} />
  }

  return (
    <Box
      ref={listRef}
      sx={{
        flex: 1,
        overflow: 'auto',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {customers.length === 0 ? (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">No customers found</Typography>
        </Box>
      ) : (
        <List dense disablePadding>
          {customers.map((customer, index) => (
            <ListItemButton
              key={customer.id}
              data-customer-index={index}
              selected={customer.id === selectedCustomerId}
              onClick={() => onSelect(customer)}
              sx={{
                borderLeft: index === focusedIndex ? '3px solid' : '3px solid transparent',
                borderColor: index === focusedIndex ? 'primary.main' : 'transparent',
                py: 1,
                px: 1.5,
              }}
            >
              <ListItemText
                primary={customer.name}
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
              />
            </ListItemButton>
          ))}
        </List>
      )}
    </Box>
  )
}

export default CustomerList
