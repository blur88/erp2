import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import FiscalPeriodFormDialog from '@/components/accounting/FiscalPeriodFormDialog'
import GeneratePeriodsDialog from '@/components/accounting/GeneratePeriodsDialog'
import { FiscalPeriod } from '@/types'

interface Props {
  formDialogOpen: boolean
  selected: FiscalPeriod | null
  onCloseForm: () => void
  onFormSuccess: () => void
  generateDialogOpen: boolean
  onCloseGenerate: () => void
  onGenerate: (year: number, startMonth: number) => Promise<void> | void
  deleteTarget: FiscalPeriod | null
  closeTarget: FiscalPeriod | null
  reopenTarget: FiscalPeriod | null
  onConfirmDelete: () => void
  onConfirmClose: () => void
  onConfirmReopen: () => void
  onCancelDelete: () => void
  onCancelClose: () => void
  onCancelReopen: () => void
}

export function FiscalPeriodsDialogs(props: Props) {
  return (
    <>
      <FiscalPeriodFormDialog open={props.formDialogOpen} period={props.selected} onClose={props.onCloseForm} onSuccess={props.onFormSuccess} />
      <GeneratePeriodsDialog open={props.generateDialogOpen} onClose={props.onCloseGenerate} onSubmit={props.onGenerate} />
      <ConfirmationDialog open={!!props.deleteTarget} title="Confirm Delete" message={`Are you sure you want to delete the period "${props.deleteTarget?.name}"? This action cannot be undone.`} confirmText="Delete" cancelText="Cancel" onConfirm={props.onConfirmDelete} onCancel={props.onCancelDelete} severity="error" />
      <ConfirmationDialog open={!!props.closeTarget} title="Close Fiscal Period" message={`Are you sure you want to close the period "${props.closeTarget?.name}"?`} confirmText="Close Period" cancelText="Cancel" onConfirm={props.onConfirmClose} onCancel={props.onCancelClose} severity="warning" />
      <ConfirmationDialog open={!!props.reopenTarget} title="Reopen Fiscal Period" message={`Are you sure you want to reopen the period "${props.reopenTarget?.name}"?`} confirmText="Reopen Period" cancelText="Cancel" onConfirm={props.onConfirmReopen} onCancel={props.onCancelReopen} severity="info" />
    </>
  )
}
