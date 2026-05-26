import { useState } from 'react'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { IconButton, Menu, MenuItem, Tooltip } from '@mui/material'

export interface RowAction {
  label: string
  onClick: () => void
  disabled?: boolean
  tooltip?: string
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
          {actions.map((action) => {
            const item = (
              <MenuItem
                key={action.label}
                disabled={action.disabled}
                onClick={() => handleAction(action.onClick)}
                dense
              >
                {action.label}
              </MenuItem>
            )
            return action.disabled && action.tooltip ? (
              <Tooltip key={action.label} title={action.tooltip} placement="left">
                <span data-tooltip={action.tooltip}>{item}</span>
              </Tooltip>
            ) : item
          })}
        </Menu>
      )}
    </>
  )
}
