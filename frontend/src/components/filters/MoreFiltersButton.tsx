import TuneIcon from '@mui/icons-material/Tune'
import { Badge, Button } from '@mui/material'

interface Props {
  activeCount: number
  onClick: () => void
}

export function MoreFiltersButton({ activeCount, onClick }: Props) {
  return (
    <Badge badgeContent={activeCount || 0} color="primary">
      <Button size="small" variant="outlined" startIcon={<TuneIcon />} onClick={onClick}>
        More Filters
      </Button>
    </Badge>
  )
}
