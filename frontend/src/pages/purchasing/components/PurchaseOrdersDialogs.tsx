import React from 'react'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import DeletedPurchaseOrdersDialog from '@/components/purchasing/DeletedPurchaseOrdersDialog'
import BlockedPurchaseOrderDialog from '@/components/purchasing/BlockedPurchaseOrderDialog'
import VendorPaymentDialog from '@/components/purchasing/VendorPaymentDialog'
import { PurchaseOrderPrint } from '@/components/print'
import type { PurchaseOrder } from '@/types'

interface PurchaseOrdersDialogsProps {
  selectedOrder: PurchaseOrder | null
  deleteConfirmOpen: boolean
  orderToDelete: any
  onCancelDelete: () => void
  onConfirmDelete: () => Promise<void> | void
  deletedOrdersDialogOpen: boolean
  onCloseDeletedOrdersDialog: () => void
  onRefreshDeletedOrders: () => void
  blockedDialogOpen: boolean
  blockedDialogType: 'edit' | 'delete'
  onCloseBlockedDialog: () => void
  onReturnAndEdit: () => Promise<void>
  onReturnOnly: () => Promise<void>
  onUnpayAndEdit: () => Promise<void>
  onReturnAndDelete: () => Promise<void>
  onUnpayAndDelete: () => Promise<void>
  isLoading: boolean
  printDialogOpen: boolean
  onClosePrintDialog: () => void
  paymentDialogOpen: boolean
  paymentDialogOrder: any
  onClosePaymentDialog: () => void
  onSubmitPayments: (payments: { paymentMethodId: string; amount: number; reference?: string }[]) => Promise<void>
}

const PurchaseOrdersDialogs: React.FC<PurchaseOrdersDialogsProps> = ({
  selectedOrder,
  deleteConfirmOpen,
  orderToDelete,
  onCancelDelete,
  onConfirmDelete,
  deletedOrdersDialogOpen,
  onCloseDeletedOrdersDialog,
  onRefreshDeletedOrders,
  blockedDialogOpen,
  blockedDialogType,
  onCloseBlockedDialog,
  onReturnAndEdit,
  onReturnOnly,
  onUnpayAndEdit,
  onReturnAndDelete,
  onUnpayAndDelete,
  isLoading,
  printDialogOpen,
  onClosePrintDialog,
  paymentDialogOpen,
  paymentDialogOrder,
  onClosePaymentDialog,
  onSubmitPayments,
}) => {
  return (
    <>
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onCancel={onCancelDelete}
        onConfirm={onConfirmDelete}
        title="Delete Purchase Order"
        message={`Are you sure you want to delete purchase order ${orderToDelete?.orderNumber}? This action can be undone from the deleted orders list.`}
        confirmText="Delete"
        severity="error"
      />

      <DeletedPurchaseOrdersDialog
        open={deletedOrdersDialogOpen}
        onClose={onCloseDeletedOrdersDialog}
        onRefresh={onRefreshDeletedOrders}
      />

      {selectedOrder && (
        <BlockedPurchaseOrderDialog
          open={blockedDialogOpen}
          orderNumber={selectedOrder.orderNumber}
          isReceived={!!(selectedOrder.goodsReceivedNotes && selectedOrder.goodsReceivedNotes.length > 0 && selectedOrder.goodsReceivedNotes[0].status === 'received')}
          isPaid={!!(selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0)}
          actionType={blockedDialogType}
          onClose={onCloseBlockedDialog}
          onReturnAndEdit={onReturnAndEdit}
          onReturnOnly={onReturnOnly}
          onUnpayAndEdit={onUnpayAndEdit}
          onReturnAndDelete={onReturnAndDelete}
          onUnpayAndDelete={onUnpayAndDelete}
          loading={isLoading}
        />
      )}

      {selectedOrder && (
        <PurchaseOrderPrint
          open={printDialogOpen}
          onClose={onClosePrintDialog}
          purchaseOrder={selectedOrder}
        />
      )}

      {paymentDialogOrder && (
        <VendorPaymentDialog
          open={paymentDialogOpen}
          onClose={onClosePaymentDialog}
          onSubmit={onSubmitPayments}
          orderNumber={paymentDialogOrder.orderNumber || ''}
          totalAmount={parseFloat(paymentDialogOrder.totalAmount) || 0}
          paidAmount={parseFloat(paymentDialogOrder.paidAmount) || 0}
        />
      )}
    </>
  )
}

export default PurchaseOrdersDialogs
