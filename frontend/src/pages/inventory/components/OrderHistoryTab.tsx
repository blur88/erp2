import { useNavigate } from 'react-router-dom'

import PagePagination from '@/components/common/PagePagination'
import { StatusChip } from '@/components/common/StatusChip'
import { useListUrlState } from '@/hooks/useListUrlState'
import { DataTable, type Column, bold, statusGroup, viewAction } from '@/components/common/DataTable'
import { useGetProductOrderHistoryQuery, type ProductOrderHistoryItem } from '@/store/api/inventoryApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface OrderHistoryTabProps {
  productId: string
}

export default function OrderHistoryTab({ productId }: OrderHistoryTabProps) {
  const navigate = useNavigate()
  const { page, limit, setPage, setLimit } = useListUrlState({ namespace: 'orderHistory' })
  const paginationProps = { page, limit, onPageChange: setPage, onLimitChange: setLimit }

  const { data, isLoading, isError } = useGetProductOrderHistoryQuery({ productId, page, limit })
  const orders = data?.data ?? []
  const total = data?.meta?.total ?? 0

  const goToOrder = (order: ProductOrderHistoryItem) => {
    if (order.type === 'sales_order') {
      navigate(`/sales/orders/${order.orderNumber}/view`)
    } else {
      navigate(`/purchasing/orders/${order.orderNumber}/view`)
    }
  }

  const getOrderTypeLabel = (type: string): string =>
    type === 'sales_order' ? 'Sales Order' : 'Purchase Order'

  const renderStatus = (order: ProductOrderHistoryItem) => {
    const payment = (
      <StatusChip
        key="payment"
        status={
          order.paymentStatus === 'paid'
            ? 'paid'
            : order.paymentStatus === 'partial'
              ? 'partial'
              : 'unpaid'
        }
        sx={{ fontSize: '0.7rem' }}
      />
    )
    const secondary =
      order.type === 'sales_order' ? (
        <StatusChip
          key="fulfillment"
          status={order.fulfillmentStatus === 'fulfilled' ? 'fulfilled' : 'unfulfilled'}
          sx={{ fontSize: '0.7rem' }}
        />
      ) : (
        <StatusChip
          key="received"
          status={order.receivedStatus === 'received' ? 'received' : 'not_received'}
          sx={{ fontSize: '0.7rem' }}
        />
      )
    return statusGroup([payment, secondary])
  }

  const columns: Column<ProductOrderHistoryItem>[] = [
    { header: 'Type', width: '12%', render: (o) => getOrderTypeLabel(o.type) },
    { header: 'Order #', width: '12%', render: (o) => bold(o.orderNumber) },
    { header: 'Customer/Vendor', width: '18%', render: (o) => o.customerOrVendor },
    { header: 'Date', width: '12%', render: (o) => formatDate(o.date) },
    { header: 'Order Status', width: '16%', render: (o) => renderStatus(o) },
    { header: 'Quantity', align: 'right', width: '10%', render: (o) => Math.floor(o.quantity) },
    { header: 'Sub-Total', align: 'right', width: '12%', render: (o) => bold(formatCurrency(o.subTotal)) },
    { header: 'Action', align: 'right', width: '8%', render: (o) => viewAction(() => goToOrder(o)) },
  ]

  return (
    <DataTable
      columns={columns}
      rows={orders}
      getRowKey={(o) => o.id}
      emptyText="No order history found for this product"
      isLoading={isLoading}
      isError={isError}
      errorText="Failed to load order history."
      paginationSlot={<PagePagination total={total} {...paginationProps} />}
    />
  )
}
