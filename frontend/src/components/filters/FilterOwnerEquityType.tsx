import { FilterSelect } from './FilterSelect'

const OPTIONS = [
  { value: 'capital_injection', label: 'Capital Injection' },
  { value: 'owner_drawing', label: 'Owner Drawing' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterOwnerEquityType({ field, value, onChange }: Props) {
  return (
    <FilterSelect field={field} label="Type" value={value} options={OPTIONS} onChange={onChange} />
  )
}
