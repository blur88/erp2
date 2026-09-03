import { Box, Button, Typography } from '@mui/material'

/**
 * The bottom bar of the page's flex column.
 *
 * NOT sticky. The page follows the SimpleListPage shape: the outer column
 * never scrolls, so this bar simply stays where it is as a fixed-height flex
 * sibling below the one scrolling pane. `position: sticky` was needed only
 * while the whole page scrolled underneath it, and keeping it would pin the
 * bar against a container that no longer moves.
 *
 * Placement is still load-bearing: this must be a DIRECT CHILD of the page's
 * outer flex column, a sibling of the scroll pane — never inside it, or it
 * scrolls away with the tables.
 *
 * jsdom has no layout engine, so no automated test can catch that regression —
 * the browser gate is what does.
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
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        py: 2,
        px: { xs: 2, sm: 3 },
        mt: 3,
        // Opaque, or the tables scroll through it.
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {isDirty ? 'Unsaved changes' : ''}
      </Typography>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button variant="outlined" size="large" onClick={onCancel} disabled={!isDirty || isSaving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="primary"
          size="large"
          onClick={onSave}
          disabled={!isDirty || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </Box>
    </Box>
  )
}
