import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import CreateSettlementDialog from '@/components/accounting/CreateSettlementDialog'
import type { Settlement } from '@/types'

interface Props {
  dialogOpen: boolean
  onCloseDialog: () => void
  onCreate: (data: { paymentMethodId: string; settlementDate: string; paymentIds: string[]; reference?: string; notes?: string }) => Promise<void> | void
  cancelTarget: Settlement | null
  onConfirmCancel: () => void
  onCancelCancel: () => void
}

export function SettlementsDialogs({ dialogOpen, onCloseDialog, onCreate, cancelTarget, onConfirmCancel, onCancelCancel }: Props) {
  return (
    <>
      <CreateSettlementDialog open={dialogOpen} onClose={onCloseDialog} onCreate={onCreate} />
      <ConfirmationDialog open={!!cancelTarget} title="Cancel Settlement" message={`Cancel settlement ${cancelTarget?.settlementNumber}?`} confirmText="Cancel Settlement" cancelText="No" onConfirm={onConfirmCancel} onCancel={onCancelCancel} severity="error" />
    </>
  )
}
