import { CustomerType } from '@/types'

export function formatCustomerType(type: CustomerType): string {
  const labels: Record<CustomerType, string> = {
    [CustomerType.INDIVIDUAL]: 'Individual',
    [CustomerType.BUSINESS]: 'Business',
  }
  return labels[type] ?? type
}
