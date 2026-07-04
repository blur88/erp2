import type { SxProps, Theme } from '@mui/material'

export const LINE_ITEM_TABLE_SX = (theme: Theme): SxProps<Theme> => ({
  '& .MuiTableCell-root': {
    border: `1px solid ${theme.palette.divider}`,
    padding: '4px 8px',
    fontSize: '0.875rem',
  },
  '& .MuiTableHead-root .MuiTableCell-root': {
    backgroundColor: theme.palette.grey[50],
    fontWeight: 600,
  },
  '& .MuiTableBody-root .MuiTableRow-root:hover': {
    backgroundColor: theme.palette.action.hover,
  },
  '& .MuiTextField-root .MuiOutlinedInput-root': {
    '& fieldset': { border: 'none' },
    '&:hover fieldset': { border: `1px solid ${theme.palette.primary.main}` },
    '&.Mui-focused fieldset': { border: `1px solid ${theme.palette.primary.main}` },
    backgroundColor: 'transparent',
    fontSize: '0.875rem',
  },
  '& .MuiTextField-root .MuiInputBase-input': { padding: '6px 8px' },
  '& .MuiAutocomplete-root .MuiOutlinedInput-root': {
    paddingTop: 0,
    paddingBottom: 0,
  },
})
