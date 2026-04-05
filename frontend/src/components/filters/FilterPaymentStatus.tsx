import { useId } from 'react'
import { FilterSelect } from './FilterSelect'

const PAYMENT_STATUS_OPTIONS = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'overpaid', label: 'Overpaid' },
]

interface Props {
  value: string | null
  onChange: (value: string | null) => void
  includeOverpaid?: boolean
}

export function FilterPaymentStatus({ value, onChange, includeOverpaid = true }: Props) {
  const uid = useId()
  const options = includeOverpaid
    ? PAYMENT_STATUS_OPTIONS
    : PAYMENT_STATUS_OPTIONS.filter((option) => option.value !== 'overpaid')

  return (
    <FilterSelect
      field={uid}
      label="Payment"
      type="select"
      value={value}
      options={options}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
