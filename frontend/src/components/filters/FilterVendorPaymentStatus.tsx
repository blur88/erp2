import { FilterSelect } from './FilterSelect'

const VENDOR_PAYMENT_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterVendorPaymentStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Status"
      value={value}
      options={VENDOR_PAYMENT_STATUS_OPTIONS}
      onChange={onChange}
    />
  )
}
