import ClearIcon from '@mui/icons-material/Clear'
import SearchIcon from '@mui/icons-material/Search'
import { IconButton, InputAdornment, TextField } from '@mui/material'

interface Props {
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onCommit: () => void
  inputRef?: React.RefObject<HTMLInputElement | null>
}

export function FilterSearch({ value, placeholder = 'Search...', onChange, onCommit, inputRef }: Props) {
  return (
    <TextField
      inputRef={inputRef}
      size="small"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onCommit()
        }
      }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => onChange('')} edge="end" aria-label="clear search">
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : null,
        },
      }}
      sx={{ minWidth: 220 }}
    />
  )
}
