import { FilterSelect } from './FilterSelect'

const OPTIONS = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'unbalanced', label: 'Unbalanced' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterBalancedStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect field={field} label="Balanced" value={value} options={OPTIONS} onChange={onChange} />
  )
}
