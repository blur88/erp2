import WarningAmberIcon from '@mui/icons-material/WarningAmber'

import { StatusChip } from '@/components/common/StatusChip'
import { getStockStatus } from '@/utils/stockStatus'

interface StockIndicatorChipProps {
  stockQuantity: number
  quantity: number
}

export default function StockIndicatorChip({ stockQuantity, quantity }: StockIndicatorChipProps) {
  const status = getStockStatus(stockQuantity, quantity)

  if (status === 'in_stock') {
    return <StatusChip status="in_stock" label="In stock" variant="outlined" />
  }

  if (status === 'out_of_stock') {
    return (
      <StatusChip
        status="out_of_stock"
        label={`Out of stock (${Number(stockQuantity)})`}
        icon={<WarningAmberIcon />}
        variant="outlined"
      />
    )
  }

  return (
    <StatusChip
      status="insufficient"
      label={`Only ${Number(stockQuantity)} left (need ${quantity})`}
      icon={<WarningAmberIcon />}
      variant="outlined"
    />
  )
}
