import { useState } from 'react'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { IconButton, Menu, MenuItem } from '@mui/material'

export interface RowAction {
  label: string
  onClick: () => void
  disabled?: boolean
}

interface RowActionMenuProps {
  actions: RowAction[]
}

export default function RowActionMenu({ actions }: RowActionMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    setAnchor(e.currentTarget)
  }

  const handleClose = () => setAnchor(null)

  const handleAction = (onClick: () => void) => {
    onClick()
    handleClose()
  }

  return (
    <>
      <IconButton size="small" aria-label="row actions" onClick={handleOpen}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
      {anchor && (
        <Menu
          anchorEl={anchor}
          open
          onClose={handleClose}
          onClick={(e) => e.stopPropagation()}
        >
          {actions.map((action) => (
            <MenuItem
              key={action.label}
              disabled={action.disabled}
              onClick={() => handleAction(action.onClick)}
              dense
            >
              {action.label}
            </MenuItem>
          ))}
        </Menu>
      )}
    </>
  )
}
