import { FilterSelect } from './FilterSelect'

const OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'CANCELLED', label: 'Cancelled' },
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
