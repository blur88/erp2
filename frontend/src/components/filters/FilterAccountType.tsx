import { FilterSelect } from './FilterSelect'

const OPTIONS = [
  { value: 'ASSET', label: 'Asset' },
  { value: 'LIABILITY', label: 'Liability' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'REVENUE', label: 'Revenue' },
  { value: 'EXPENSE', label: 'Expense' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterAccountType({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Account Type"
      value={value}
      options={OPTIONS}
      onChange={onChange}
    />
  )
}
