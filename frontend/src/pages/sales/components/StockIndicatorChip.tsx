import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { Chip } from '@mui/material'

import { getStockStatus } from '@/utils/stockStatus'

interface StockIndicatorChipProps {
  stockQuantity: number
  quantity: number
}

export default function StockIndicatorChip({ stockQuantity, quantity }: StockIndicatorChipProps) {
  const status = getStockStatus(stockQuantity, quantity)

  if (status === 'in_stock') {
    return <Chip label="In stock" color="success" size="small" variant="outlined" />
  }

  if (status === 'out_of_stock') {
    return (
      <Chip
        icon={<WarningAmberIcon />}
        label={`Out of stock (${Number(stockQuantity)})`}
        color="error"
        size="small"
        variant="outlined"
      />
    )
  }

  return (
    <Chip
      icon={<WarningAmberIcon />}
      label={`Only ${Number(stockQuantity)} left (need ${quantity})`}
      color="warning"
      size="small"
      variant="outlined"
    />
  )
}
