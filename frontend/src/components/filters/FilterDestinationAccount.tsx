import { useGetChartOfAccountsQuery } from '@/store/api/accountingApi'

import { FilterSelect } from './FilterSelect'

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterDestinationAccount({ field, value, onChange }: Props) {
  const { data } = useGetChartOfAccountsQuery({ page: 1, isCashEquivalent: true, limit: 200 })
  const options = ((data?.data ?? []) as { id: string; code: string; name: string; isActive: boolean }[])
    .filter((account) => account.isActive)
    .map((account) => ({ value: account.id, label: `${account.code} - ${account.name}` }))

  return (
    <FilterSelect
      field={field}
      label="Destination Account"
      value={value}
      options={options}
      onChange={onChange}
    />
  )
}
