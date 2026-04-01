import React from 'react'
import { TextField, InputAdornment, Typography, Paper } from '@mui/material'
import { CalculatorState } from '../types'

interface CalculatorDisplayProps {
  state: CalculatorState
  compact?: boolean
}

export const CalculatorDisplay: React.FC<CalculatorDisplayProps> = ({ 
  state, 
  compact = false 
}) => {
  return (
    <Paper 
      elevation={1} 
      sx={{ 
        p: compact ? 1.5 : 2, 
        backgroundColor: compact ? 'background.paper' : 'grey.50',
        ...(compact ? {} : { 
          border: theme => `1px solid ${theme.palette.divider}`
        })
      }}
    >
      <TextField
        value={state.display}
        variant="outlined"
        fullWidth
        size={compact ? 'small' : 'medium'}
        InputProps={{
          readOnly: true,
          endAdornment: state.operation && (
            <InputAdornment position="end">
              <Typography variant="caption" color="text.secondary">
                {state.operation}
              </Typography>
            </InputAdornment>
          ),
          sx: {
            '& input': {
              textAlign: 'right',
              fontSize: compact ? '1.2rem' : '1.5rem',
              fontWeight: 600,
              color: 'text.primary',
            }
          }
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            backgroundColor: 'background.paper',
          }
        }}
      />
    </Paper>
  )
}
