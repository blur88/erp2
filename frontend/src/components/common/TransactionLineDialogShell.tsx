import { useId, type ReactNode } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Divider,
  CircularProgress,
} from '@mui/material'

export interface TransactionLineDialogShellProps {
  open: boolean
  title: string
  onRequestClose: () => void
  loading?: boolean
  summary: ReactNode
  children: ReactNode
  totals: ReactNode
  alerts?: ReactNode
  actions: ReactNode
  discardOpen: boolean
  discardTitle: string
  onKeepEditing: () => void
  onDiscard: () => void
}

/**
 * Shared structure for the Payment and Refund line dialogs (#1006).
 *
 * Owns presentation only — width, header, labelling, divider rhythm, the loading
 * region and the discard confirmation. All form state, validation, summary/totals
 * content and payload construction stay in the consuming dialog, which is why
 * `actions` is a slot: PaymentDialog and RefundDialog style their submit buttons
 * differently on purpose (refund is destructive).
 */
export default function TransactionLineDialogShell({
  open,
  title,
  onRequestClose,
  loading = false,
  summary,
  children,
  totals,
  alerts,
  actions,
  discardOpen,
  discardTitle,
  onKeepEditing,
  onDiscard,
}: TransactionLineDialogShellProps) {
  // Generated internally so callers cannot introduce duplicate or mismatched IDs.
  const titleId = useId()

  return (
    <Dialog
      open={open}
      onClose={onRequestClose}
      maxWidth="md"
      fullWidth
      aria-labelledby={titleId}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            <Box sx={{ mt: 1 }}>{summary}</Box>
            <Divider sx={{ mb: 2 }} />
            {children}
            <Divider sx={{ mb: 2 }} />
            {totals}
            {alerts}
          </>
        )}
      </DialogContent>
      {/* Actions render even while loading so Cancel stays reachable; each dialog
          disables its own submit button. */}
      <DialogActions>{actions}</DialogActions>
      <Dialog open={discardOpen} onClose={onKeepEditing} transitionDuration={0}>
        <DialogTitle>{discardTitle}</DialogTitle>
        <DialogActions>
          <Button onClick={onKeepEditing}>Keep Editing</Button>
          <Button color="error" onClick={onDiscard}>
            Discard
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}

export interface DialogLineRowProps {
  children: ReactNode
  trailing: ReactNode
}

/**
 * One editable line in a transaction dialog.
 *
 * `trailing` (Reference + Delete) is rendered as a SINGLE flex child so the pair
 * wraps together instead of separating — flex siblings do not wrap as a unit
 * unless grouped. 248px ≈ 200px reference minimum (#999) + ~40px button + 8px gap.
 * Established in PR #1000 for PaymentDialog; shared here so it cannot drift.
 */
export function DialogLineRow({ children, trailing }: DialogLineRowProps) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5, alignItems: 'center' }}>
      {children}
      <Box sx={{ flex: 1, minWidth: 248, display: 'flex', gap: 1, alignItems: 'center' }}>
        {trailing}
      </Box>
    </Box>
  )
}
