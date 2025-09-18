import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  Grid,
  Divider,
  useTheme,
} from '@mui/material'
import {
  Keyboard as KeyboardIcon,
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  GetApp as ExportIcon,
  CloudUpload as ImportIcon,
  RestoreFromTrash as RestoreIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  KeyboardReturn as EnterIcon,
  Home as HomeIcon,
  LastPage as EndIcon,
} from '@mui/icons-material'

interface KeyboardShortcutsHelpProps {
  open: boolean
  onClose: () => void
}

interface ShortcutGroup {
  title: string
  shortcuts: Array<{
    keys: string[]
    description: string
    icon?: React.ReactNode
  }>
}

const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({
  open,
  onClose,
}) => {
  const theme = useTheme()

  const shortcutGroups: ShortcutGroup[] = [
    {
      title: 'Navigation',
      shortcuts: [
        {
          keys: ['↑', '↓'],
          description: 'Navigate up/down in table',
          icon: <ArrowUpIcon fontSize="small" />,
        },
        {
          keys: ['Home'],
          description: 'Go to first item',
          icon: <HomeIcon fontSize="small" />,
        },
        {
          keys: ['End'],
          description: 'Go to last item',
          icon: <EndIcon fontSize="small" />,
        },
        {
          keys: ['Page Up'],
          description: 'Navigate up one page',
        },
        {
          keys: ['Page Down'],
          description: 'Navigate down one page',
        },
        {
          keys: ['Enter'],
          description: 'Edit selected item',
          icon: <EnterIcon fontSize="small" />,
        },
        {
          keys: ['Esc'],
          description: 'Clear selection / Close dialogs',
        },
      ],
    },
    {
      title: 'Actions',
      shortcuts: [
        {
          keys: ['Ctrl', 'F'],
          description: 'Focus search field',
          icon: <SearchIcon fontSize="small" />,
        },
        {
          keys: ['N', '+'],
          description: 'Add new product',
          icon: <AddIcon fontSize="small" />,
        },
        {
          keys: ['E'],
          description: 'Edit selected item',
          icon: <EditIcon fontSize="small" />,
        },
        {
          keys: ['D', 'Del'],
          description: 'Delete selected item',
          icon: <DeleteIcon fontSize="small" />,
        },
        {
          keys: ['Ctrl', 'R'],
          description: 'Refresh list',
          icon: <RefreshIcon fontSize="small" />,
        },
        {
          keys: ['T'],
          description: 'View deleted items',
          icon: <RestoreIcon fontSize="small" />,
        },
      ],
    },
    {
      title: 'Import/Export',
      shortcuts: [
        {
          keys: ['Ctrl', 'X'],
          description: 'Export to CSV',
          icon: <ExportIcon fontSize="small" />,
        },
        {
          keys: ['Ctrl', 'I'],
          description: 'Import from file',
          icon: <ImportIcon fontSize="small" />,
        },
      ],
    },
  ]

  const renderKey = (key: string) => (
    <Chip
      key={key}
      label={key}
      size="small"
      variant="outlined"
      sx={{
        fontFamily: 'monospace',
        fontWeight: 'bold',
        minWidth: 'auto',
        height: 24,
        fontSize: '0.75rem',
        backgroundColor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
        borderColor: theme.palette.mode === 'dark' ? 'grey.600' : 'grey.300',
      }}
    />
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: '80vh',
        },
      }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <KeyboardIcon />
          <Typography variant="h6">Keyboard Shortcuts</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Use these keyboard shortcuts to navigate and interact with the products page more efficiently.
        </Typography>

        <Grid container spacing={3}>
          {shortcutGroups.map((group, groupIndex) => (
            <Grid item xs={12} md={4} key={groupIndex}>
              <Typography
                variant="subtitle1"
                fontWeight="bold"
                color="primary"
                sx={{ mb: 2 }}
              >
                {group.title}
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {group.shortcuts.map((shortcut, shortcutIndex) => (
                  <Box key={shortcutIndex}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: 0.5,
                      }}
                    >
                      {shortcut.icon}
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        {shortcut.keys.map((key, keyIndex) => (
                          <React.Fragment key={keyIndex}>
                            {keyIndex > 0 && (
                              <Typography
                                variant="caption"
                                sx={{ mx: 0.5, color: 'text.secondary' }}
                              >
                                +
                              </Typography>
                            )}
                            {renderKey(key)}
                          </React.Fragment>
                        ))}
                      </Box>
                    </Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ ml: shortcut.icon ? 3 : 0, fontSize: '0.875rem' }}
                    >
                      {shortcut.description}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {groupIndex < shortcutGroups.length - 1 && (
                <Divider sx={{ mt: 2, display: { xs: 'block', md: 'none' } }} />
              )}
            </Grid>
          ))}
        </Grid>

        <Box sx={{ mt: 3, p: 2, backgroundColor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            <strong>Note:</strong> Keyboard shortcuts are disabled when typing in input fields,
            except for Ctrl+F which can be used to focus the search field from anywhere.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Got it
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default KeyboardShortcutsHelp