import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import ChartOfAccountFormDialog from '@/components/accounting/ChartOfAccountFormDialog'
import DeletedAccountsDialog from '@/components/accounting/DeletedAccountsDialog'
import type { ChartOfAccount } from '@/types'

interface Props {
  formDialogOpen: boolean
  selected: ChartOfAccount | null
  onCloseForm: () => void
  onFormSuccess: () => void
  deleteTarget: ChartOfAccount | null
  onConfirmDelete: () => void
  onCancelDelete: () => void
  seedConfirmOpen: boolean
  onConfirmSeed: () => void
  onCancelSeed: () => void
  deletedDialogOpen: boolean
  onCloseDeletedDialog: () => void
  onChanged: () => void
}

export function ChartOfAccountsDialogs(props: Props) {
  return (
    <>
      <ChartOfAccountFormDialog open={props.formDialogOpen} account={props.selected} onClose={props.onCloseForm} onSuccess={props.onFormSuccess} />
      <ConfirmationDialog open={!!props.deleteTarget} title="Confirm Delete" message={`Are you sure you want to delete the account "${props.deleteTarget?.name}"? This action cannot be undone.`} confirmText="Delete" cancelText="Cancel" onConfirm={props.onConfirmDelete} onCancel={props.onCancelDelete} severity="error" />
      <ConfirmationDialog open={props.seedConfirmOpen} title="Seed Default Accounts" message="This will create a standard chart of accounts with common account types. Are you sure you want to proceed?" confirmText="Seed Accounts" cancelText="Cancel" onConfirm={props.onConfirmSeed} onCancel={props.onCancelSeed} severity="info" />
      <DeletedAccountsDialog open={props.deletedDialogOpen} onClose={props.onCloseDeletedDialog} onChanged={props.onChanged} />
    </>
  )
}
