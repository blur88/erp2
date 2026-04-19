import { FilterSelect } from './FilterSelect'

const OPTIONS = [
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterBankReconciliationStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect field={field} label="Status" value={value} options={OPTIONS} onChange={onChange} />
  )
}
