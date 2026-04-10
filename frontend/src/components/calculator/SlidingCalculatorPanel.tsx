import React from 'react'
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  useTheme,
  useMediaQuery,
  Divider,
} from '@mui/material'
import { default as CloseIcon } from '@mui/icons-material/Close'
import { default as CalculateIcon } from '@mui/icons-material/Calculate'
import { useCalculator } from './hooks/useCalculator'
import { useKeyboardHandler } from './hooks/useKeyboardHandler'
import { CalculatorDisplay, CalculatorGrid, CalculatorHistory } from './components'
import { getButtonStyles } from './styles/buttonStyles'

interface SlidingCalculatorPanelProps {
  isOpen: boolean
  onClose: () => void
}

const SlidingCalculatorPanel: React.FC<SlidingCalculatorPanelProps> = ({ isOpen, onClose }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const { state, actions } = useCalculator()
  const buttonStyles = getButtonStyles(theme)
  
  useKeyboardHandler({
    isEnabled: isOpen,
    calculatorActions: actions,
  })

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={onClose}
      variant={isMobile ? 'temporary' : 'persistent'}
      sx={{
        width: isMobile ? 'auto' : (isOpen ? 320 : 0),
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: 320,
          boxSizing: 'border-box',
          backgroundColor: 'background.default',
          borderLeft: `1px solid ${theme.palette.divider}`,
          zIndex: isMobile ? 1300 : 1200,
          ...(isMobile ? {} : {
            position: 'fixed',
            right: 0,
            top: 0,
            height: '100vh',
            transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.3s ease-in-out',
          }),
        },
      }}
    >
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ 
          p: 2, 
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalculateIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Calculator
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        <Box sx={{ p: 2 }}>
          <CalculatorDisplay state={state} />
        </Box>

        <Box sx={{ flex: 1, p: 2, paddingTop: 0 }}>
          <CalculatorGrid 
            calculatorActions={actions} 
            buttonStyles={buttonStyles}
            includeHistory
          />
        </Box>

        <CalculatorHistory state={state} />

        {/* Keyboard shortcuts help */}
        <Divider />
        <Box sx={{ p: 2, backgroundColor: 'grey.50' }}>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              display: 'block',
              mb: 0.5
            }}>
            Keyboard shortcuts:
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              fontSize: '0.7rem'
            }}>
            Numbers (0-9) • Operators (+, -, *, /) • Enter/= (equals) • Esc (clear) • Backspace • Delete (CE)
          </Typography>
        </Box>
      </Box>
    </Drawer>
  );
}

export default SlidingCalculatorPanel