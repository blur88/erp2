import { Chip } from '@mui/material'
import type { ChipProps } from '@mui/material'

interface MarginChipProps {
  price: number
  cost: number
  sx?: ChipProps['sx']
}

export default function MarginChip({ price, cost, sx }: MarginChipProps) {
  if (price <= 0 || cost <= 0) {
    return null
  }

  const margin = ((price - cost) / price) * 100
  const color: ChipProps['color'] =
    margin > 20 ? 'success' : margin > 10 ? 'warning' : 'error'

  return (
    <Chip
      label={`${margin.toFixed(1)}%`}
      size="small"
      variant="outlined"
      color={color}
      sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20, minWidth: 42, ...sx }}
    />
  )
}
