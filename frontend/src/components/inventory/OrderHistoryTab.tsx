import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import PagePagination from '@/components/common/PagePagination'
import { ApiService } from '@/services/api'
import { useNotification } from '@/hooks/useNotification'
import { StatusChip } from '@/components/common/StatusChip'
import { usePagination } from '@/hooks/usePagination'
import { DataTable, type Column, bold, statusGroup, viewAction } from '@/components/common/DataTable'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface OrderHistoryTabProps {
  productId: string
}

interface OrderHistoryItem {
  id: string
  type: 'sales_order' | 'purchase_order'
  orderNumber: string
  customerOrVendor: string
  date: Date | string
  paymentStatus?: string
  fulfillmentStatus?: string
  receivedStatus?: string
  quantity: number
  subTotal: number
}

const OrderHistoryTab: React.FC<OrderHistoryTabProps> = ({ productId }) => {
  const { showError } = useNotification()
  const navigate = useNavigate()

  const goToOrder = (order: OrderHistoryItem) => {
    if (order.type === 'sales_order') {
      navigate(`/sales/orders/${order.orderNumber}/view`)
    } else {
      navigate(`/purchasing/orders/${order.orderNumber}/view`)
    }
  }

  const { page, limit, paginationProps } = usePagination()
  const [orders, setOrders] = useState<OrderHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const fetchOrderHistory = async () => {
      try {
        setLoading(true)
        const response = (await ApiService.get(`/inventory/products/${productId}/order-history`, {
          params: { page, limit },
        })) as any
        const data = response.data?.data || response.data || []
        const meta = response.data?.meta || response.meta || {}
        setOrders(data)
        setTotal(meta.total || 0)
      } catch (error: any) {
        console.error('Failed to fetch order history:', error)
        showError(error?.message || 'Failed to load order history')
      } finally {
        setLoading(false)
      }
    }
    if (productId) {
      fetchOrderHistory()
    }
  }, [productId, page, limit, showError])

  const getOrderTypeLabel = (type: string): string =>
    type === 'sales_order' ? 'Sales Order' : 'Purchase Order'

  const renderStatus = (order: OrderHistoryItem) => {
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

  const columns: Column<OrderHistoryItem>[] = [
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
      isLoading={loading}
      sticky
      footer={
        <PagePagination total={total} {...paginationProps} />
      }
    />
  )
}

export default OrderHistoryTab
