import React from 'react'
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from '@mui/material'
import { default as CloseIcon } from '@mui/icons-material/Close'
import { useTheme } from '@mui/material/styles'

interface KeyboardShortcutsModalProps {
  open: boolean
  onClose: () => void
}

const LIST_NAVIGATION_SHORTCUTS = [
  { key: '↑ / ↓', action: 'Navigate between items' },
  { key: 'Page Up / Page Down', action: 'Jump 20 items' },
  { key: 'Home / End', action: 'First / last item' },
  { key: 'Enter', action: 'Edit selected item' },
  { key: 'Escape', action: 'Clear selection or close dialog' },
]

const GLOBAL_SHORTCUTS = [
  { key: 'Ctrl+K', action: 'Open global search' },
  { key: '?', action: 'Show keyboard shortcuts' },
]

function ShortcutGroup({ label, shortcuts }: { label: string; shortcuts: { key: string; action: string }[] }) {
  const theme = useTheme()

  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        variant="overline"
        sx={{ color: theme.palette.text.secondary, fontWeight: 600, letterSpacing: '0.08em', display: 'block', mb: 1 }}
      >
        {label}
      </Typography>
      <Table size="small">
        <TableBody>
          {shortcuts.map(({ key, action }) => (
            <TableRow key={key} sx={{ '&:last-child td': { border: 0 } }}>
              <TableCell sx={{ pl: 0, width: 160, border: 0, py: 0.75 }}>
                <Box
                  component="kbd"
                  sx={{
                    bgcolor: theme.palette.action.hover,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: '4px',
                    px: 0.75,
                    py: 0.25,
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    color: theme.palette.text.primary,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {key}
                </Box>
              </TableCell>
              <TableCell sx={{ pr: 0, border: 0, py: 0.75 }}>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  {action}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}

const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ open, onClose }) => {
  const theme = useTheme()

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>Keyboard Shortcuts</Typography>
        <IconButton aria-label="close" onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <ShortcutGroup label="List Navigation" shortcuts={LIST_NAVIGATION_SHORTCUTS} />
        <Divider sx={{ my: 2 }} />
        <ShortcutGroup label="Global" shortcuts={GLOBAL_SHORTCUTS} />

        <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
          <Typography variant="caption" sx={{ color: theme.palette.text.disabled }}>
            List navigation shortcuts apply on list and table pages only.
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  )
}

export default KeyboardShortcutsModal
