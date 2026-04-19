import { FilterSelect } from './FilterSelect'

const OPTIONS = [
  { value: 'manual', label: 'Manual Entry' },
  { value: 'sales_order', label: 'Sales Order' },
  { value: 'payment', label: 'Customer Payment' },
  { value: 'settlement', label: 'Settlement' },
  { value: 'goods_received_note', label: 'Goods Receipt' },
  { value: 'vendor_payment', label: 'Vendor Payment' },
  { value: 'stock_adjustment', label: 'Stock Adjustment' },
  { value: 'owner_equity_transaction', label: 'Owner Equity' },
  { value: 'expense', label: 'Expense' },
  { value: 'opening_balance', label: 'Opening Balance' },
  { value: 'fund_transfer', label: 'Fund Transfer' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterJournalEntryType({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Entry Type"
      value={value}
      options={OPTIONS}
      onChange={onChange}
    />
  )
}
