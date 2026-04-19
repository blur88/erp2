import { FilterSelect } from './FilterSelect'

const OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterFiscalPeriodStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect field={field} label="Status" value={value} options={OPTIONS} onChange={onChange} />
  )
}
