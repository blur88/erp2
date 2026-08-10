import { FilterSelect } from './FilterSelect'

const PAYMENT_STATUS_OPTIONS = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'overpaid', label: 'Overpaid' },
]

const UPPER_PAYMENT_STATUS_OPTIONS = PAYMENT_STATUS_OPTIONS.map((option) => ({
  ...option,
  value: option.value.toUpperCase(),
}))

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
  includeOverpaid?: boolean
  valueCase: 'lower' | 'upper'
}

export function FilterPaymentStatus({
  field,
  value,
  onChange,
  includeOverpaid = true,
  valueCase,
}: Props) {
  const sourceOptions = valueCase === 'upper' ? UPPER_PAYMENT_STATUS_OPTIONS : PAYMENT_STATUS_OPTIONS
  const options = includeOverpaid
    ? sourceOptions
    : sourceOptions.filter((option) => option.value.toLowerCase() !== 'overpaid')

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
