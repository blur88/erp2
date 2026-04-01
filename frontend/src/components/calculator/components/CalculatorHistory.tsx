import React from 'react'
import { Box, Typography, Divider } from '@mui/material'
import { CalculatorState } from '../types'

interface CalculatorHistoryProps {
  state: CalculatorState
  maxEntries?: number
}

export const CalculatorHistory: React.FC<CalculatorHistoryProps> = ({
  state,
  maxEntries = 5,
}) => {
  if (state.history.length === 0) return null

  return (
    <>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          History
        </Typography>
        <Box sx={{ maxHeight: 120, overflowY: 'auto' }}>
          {state.history.slice(0, maxEntries).map((entry, index) => (
            <Typography
              key={index}
              variant="caption"
              sx={{
                display: 'block',
                color: 'text.secondary',
                py: 0.25,
              }}
            >
              {entry}
            </Typography>
          ))}
        </Box>
      </Box>
    </>
  )
}
