import { Box } from '@mui/material'

import { AppButton } from '@/components/common/AppButton'

/**
 * The bottom bar of the page's flex column.
 *
 * A plain action row, matching Create SO / Create PO (TransactionFormShell):
 * right-aligned secondary Cancel + primary submit, no surrounding card and no
 * unsaved-state notice (#1184). Draft state is carried entirely by the two
 * buttons' enablement — nothing on the page is decorated to signal it.
 *
 * NOT sticky. The page follows the SimpleListPage shape: the outer column
 * never scrolls, so this bar simply stays where it is as a fixed-height flex
 * sibling below the one scrolling pane. `position: sticky` was needed only
 * while the whole page scrolled underneath it, and keeping it would pin the
 * bar against a container that no longer moves.
 *
 * Placement is still load-bearing: this must be a DIRECT CHILD of the page's
 * outer flex column, a sibling of the scroll pane — never inside it, or it
 * scrolls away with the tables. That is also why it needs no opaque
 * background: content ends at the bounded pane above and never passes behind
 * this row.
 *
 * jsdom has no layout engine, and Emotion styles never reach getComputedStyle
 * there (CLAUDE.md), so no automated test can catch either regression — the
 * browser gate is what does. The contract to re-check there: this row is
 * right-aligned with a transparent background and no border, and its two
 * buttons match Create SO's (/sales/orders/create) at both desktop and narrow
 * widths. Compare the two pages side by side rather than asserting colours.
 */
export default function SettingsActionBar({
  isDirty, isSaving, onCancel, onSave,
}: {
  isDirty: boolean
  isSaving: boolean
  onCancel(): void
  onSave(): void
}) {
  return (
    <Box
      data-testid="settings-action-bar"
      sx={{
        flexShrink: 0,
        display: 'flex',
        gap: 2,
        justifyContent: 'flex-end',
        mt: 3,
      }}
    >
      <AppButton variant="secondary" onClick={onCancel} disabled={!isDirty || isSaving}>
        Cancel
      </AppButton>
      <AppButton
        variant="primary"
        onClick={onSave}
        disabled={!isDirty || isSaving}
        {...(isSaving ? { loading: true } : {})}
      >
        Save Changes
      </AppButton>
    </Box>
  )
}
