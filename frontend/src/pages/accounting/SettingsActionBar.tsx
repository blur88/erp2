import { Box, Button, Typography } from '@mui/material'

/**
 * Pinned to the bottom of the page's scroll container.
 *
 * Placement is load-bearing: this must be a DIRECT CHILD of
 * GenericOverviewPage, a sibling of the padded content wrapper — never inside
 * the Stack, a PageSection, or SettingsTableFrame. GenericOverviewPage has
 * `overflow: auto` and no `position`, which makes it the scroll container this
 * bar pins against. Nested one level deeper, the containing block changes and
 * the bar pins to that section instead of the page.
 *
 * jsdom has no layout engine and does not evaluate sticky positioning, so no
 * automated test can catch that regression — the browser gate is what does.
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
        position: 'sticky',
        bottom: 0,
        zIndex: 2,
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
