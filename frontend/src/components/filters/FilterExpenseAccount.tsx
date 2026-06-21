import { useMemo } from 'react'

import { useGetChartOfAccountsQuery } from '@/store/api/accountingApi'
import { AccountType } from '@/types'

import { FilterSelect } from './FilterSelect'

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterExpenseAccount({ field, value, onChange }: Props) {
  const { data } = useGetChartOfAccountsQuery({
    page: 1,
    type: AccountType.EXPENSE,
    isActive: true,
    limit: 200,
  })

  const options = useMemo(
    () =>
      (data?.data ?? []).map((account) => ({
        value: account.id,
        label: `${account.code} — ${account.name}`,
      })),
    [data],
  )

  return (
    <FilterSelect
      field={field}
      label="Expense Account"
      value={value}
      options={options}
      onChange={onChange}
    />
  )
}
