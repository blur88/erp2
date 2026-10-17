import { useId } from 'react'
import { Box, Button } from '@mui/material'

// Local rather than `@mui/utils`' visuallyHidden: that package is not a
// direct dependency (same choice as SettlementRowPicker).
const visuallyHidden = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const

interface ActionBarButtonProps {
  label: string
  variant: 'contained' | 'outlined'
  onClick?: () => void
  disabled?: boolean
  tooltip?: string
}

/**
 * A document action-bar button. When it is disabled with a reason, the reason
 * is shown on hover by a wrapping span (a disabled button receives no pointer
 * events) and given to assistive technology as the button's description.
 */
export default function ActionBarButton({ label, variant, onClick, disabled, tooltip }: ActionBarButtonProps) {
  const descriptionId = useId()
  const explained = Boolean(disabled && tooltip)

  const button = (
    <Button
      variant={variant}
      size="small"
      onClick={onClick}
      disabled={disabled}
      title={explained ? undefined : tooltip}
      aria-describedby={explained ? descriptionId : undefined}
    >
      {label}
    </Button>
  )

  if (!explained) return button

  return (
    <span title={tooltip}>
      {button}
      <Box component="span" id={descriptionId} sx={visuallyHidden}>
        {tooltip}
      </Box>
    </span>
  )
}
