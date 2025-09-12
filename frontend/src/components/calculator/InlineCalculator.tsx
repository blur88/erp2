import React from 'react'
import { Box, Typography, useTheme } from '@mui/material'
import { useCalculator } from './hooks/useCalculator'
import { CalculatorDisplay, CalculatorGrid } from './components'
import { getCompactButtonStyles } from './styles/buttonStyles'

const InlineCalculator: React.FC = () => {
  const theme = useTheme()
  const { state, actions } = useCalculator()
  const buttonStyles = getCompactButtonStyles(theme)

  return (
    <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, height: 'fit-content' }}>
      <Typography variant="h6" sx={{ mb: 2, fontSize: '1rem', fontWeight: 600 }}>
        Calculator
      </Typography>
      
      <Box sx={{ mb: 2 }}>
        <CalculatorDisplay state={state} compact />
      </Box>

      <CalculatorGrid 
        calculatorActions={actions} 
        buttonStyles={buttonStyles}
      />
    </Box>
  )
}

export default InlineCalculator