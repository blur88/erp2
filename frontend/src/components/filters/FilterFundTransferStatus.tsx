import { FilterSelect } from './FilterSelect'

const OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterFundTransferStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect field={field} label="Status" value={value} options={OPTIONS} onChange={onChange} />
  )
}
