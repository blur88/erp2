import { FilterSelect } from './FilterSelect'

const PAYMENT_STATUS_OPTIONS = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'overpaid', label: 'Overpaid' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
  includeOverpaid?: boolean
}

export function FilterPaymentStatus({ field, value, onChange, includeOverpaid = true }: Props) {
  const options = includeOverpaid
    ? PAYMENT_STATUS_OPTIONS
    : PAYMENT_STATUS_OPTIONS.filter((option) => option.value !== 'overpaid')

  return (
    <FilterSelect
      field={field}
      label="Payment"
      value={value}
      options={options}
      onChange={onChange}
    />
  )
}
