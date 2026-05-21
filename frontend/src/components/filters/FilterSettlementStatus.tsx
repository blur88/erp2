import { FilterSelect } from './FilterSelect'

const OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
  { value: 'reversed', label: 'Reversed' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterSettlementStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect field={field} label="Status" value={value} options={OPTIONS} onChange={onChange} />
  )
}
