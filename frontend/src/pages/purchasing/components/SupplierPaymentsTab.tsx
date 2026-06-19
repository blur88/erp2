import { useNavigate } from 'react-router-dom'

import { DataTable, type Column, bold, viewAction } from '@/components/common/DataTable'
import { useGetSupplierPaymentsQuery } from '@/store/api/purchasingApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface SupplierPaymentsTabProps {
  supplierId: string
}

export default function SupplierPaymentsTab({ supplierId }: SupplierPaymentsTabProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useGetSupplierPaymentsQuery(supplierId)
  const payments = data?.data ?? []

  const columns: Column<(typeof payments)[number]>[] = [
    { header: 'Payment #', width: '18%', render: (p) => bold(p.paymentNumber) },
    { header: 'Date', width: '16%', render: (p) => formatDate(p.paymentDate) },
    { header: 'Method', width: '18%', render: (p) => p.paymentMethodEntity?.name ?? '-' },
    { header: 'Reference #', width: '18%', render: (p) => p.referenceNumber ?? '-' },
    { header: 'Amount', align: 'right', width: '15%', render: (p) => formatCurrency(p.amount) },
    {
      header: 'Action',
      align: 'right',
      width: '15%',
      render: (p) => {
        const orderNumber = p.purchaseOrder?.orderNumber
        return viewAction(
          () => orderNumber && navigate(`/purchasing/orders/${orderNumber}/view`),
          !orderNumber,
        )
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={payments}
      getRowKey={(p) => p.id}
      emptyText="No payments yet for this supplier."
      isLoading={isLoading}
    />
  )
}
