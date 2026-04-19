import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import AccountMappingDialog from '@/components/accounting/AccountMappingDialog'
import type { AccountMapping } from '@/types/accountMapping'

interface Props {
  dialogOpen: boolean
  selectedMapping: AccountMapping | null
  selectedMappingType: string | null
  onCloseDialog: () => void
  onSaveSuccess: () => void
  mappingToClear: AccountMapping | null
  clearing: boolean
  onConfirmClear: () => void
  onCancelClear: () => void
}

export function AccountMappingsDialogs(props: Props) {
  return (
    <>
      <AccountMappingDialog open={props.dialogOpen} onClose={props.onCloseDialog} mapping={props.selectedMapping || undefined} mappingType={props.selectedMappingType || undefined} onSaveSuccess={props.onSaveSuccess} />
      <ConfirmationDialog open={!!props.mappingToClear} title="Clear Account Mapping" message={props.mappingToClear ? `Are you sure you want to clear "${props.mappingToClear.mappingType}"? Auto-posting for this mapping will remain disabled until reconfigured.` : ''} confirmText={props.clearing ? 'Clearing...' : 'Clear'} onConfirm={props.onConfirmClear} onCancel={props.onCancelClear} severity="warning" loading={props.clearing} />
    </>
  )
}
