import React, { useState, useEffect, useCallback } from 'react'
import {
  Drawer,
  Box,
  Typography,
  Button,
  Paper,
  IconButton,
  useTheme,
  useMediaQuery,
  Divider,
  Grid,
  TextField,
  InputAdornment,
} from '@mui/material'
import {
  Close as CloseIcon,
  Calculate as CalculateIcon,
  Clear as ClearIcon,
  Backspace as BackspaceIcon,
} from '@mui/icons-material'

interface SlidingCalculatorPanelProps {
  isOpen: boolean
  onClose: () => void
}

type CalculatorOperation = '+' | '-' | '*' | '/' | '='

interface CalculatorState {
  display: string
  previousValue: number | null
  operation: CalculatorOperation | null
  waitingForOperand: boolean
  history: string[]
}

const initialState: CalculatorState = {
  display: '0',
  previousValue: null,
  operation: null,
  waitingForOperand: false,
  history: [],
}

const SlidingCalculatorPanel: React.FC<SlidingCalculatorPanelProps> = ({ isOpen, onClose }) => {
  const theme = useTheme()
  const [state, setState] = useState<CalculatorState>(initialState)
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  
  const calculate = useCallback((firstOperand: number, secondOperand: number, operation: CalculatorOperation): number => {
    switch (operation) {
      case '+':
        return firstOperand + secondOperand
      case '-':
        return firstOperand - secondOperand
      case '*':
        return firstOperand * secondOperand
      case '/':
        if (secondOperand === 0) {
          throw new Error('Division by zero')
        }
        return firstOperand / secondOperand
      default:
        return secondOperand
    }
  }, [])

  const formatNumber = useCallback((num: number): string => {
    const str = num.toString()
    if (str.length > 12) {
      return num.toExponential(6)
    }
    return str
  }, [])

  const inputNumber = useCallback((num: string) => {
    setState(prevState => {
      if (prevState.waitingForOperand) {
        return {
          ...prevState,
          display: num,
          waitingForOperand: false,
        }
      } else {
        return {
          ...prevState,
          display: prevState.display === '0' ? num : prevState.display + num,
        }
      }
    })
  }, [])

  const inputDecimal = useCallback(() => {
    setState(prevState => {
      if (prevState.waitingForOperand) {
        return {
          ...prevState,
          display: '0.',
          waitingForOperand: false,
        }
      } else if (prevState.display.indexOf('.') === -1) {
        return {
          ...prevState,
          display: prevState.display + '.',
        }
      } else {
        return prevState
      }
    })
  }, [])

  const clear = useCallback(() => {
    setState(initialState)
  }, [])

  const clearEntry = useCallback(() => {
    setState(prevState => ({
      ...prevState,
      display: '0',
    }))
  }, [])

  const backspace = useCallback(() => {
    setState(prevState => {
      const display = prevState.display
      if (display.length > 1) {
        return {
          ...prevState,
          display: display.slice(0, -1),
        }
      } else {
        return {
          ...prevState,
          display: '0',
        }
      }
    })
  }, [])

  const performOperation = useCallback((nextOperation: CalculatorOperation) => {
    setState(prevState => {
      const inputValue = parseFloat(prevState.display)
      
      if (prevState.previousValue === null) {
        return {
          ...prevState,
          previousValue: inputValue,
          operation: nextOperation,
          waitingForOperand: true,
        }
      } else if (prevState.operation) {
        const currentValue = prevState.previousValue || 0
        try {
          const newValue = calculate(currentValue, inputValue, prevState.operation)
          const historyEntry = `${currentValue} ${prevState.operation} ${inputValue} = ${newValue}`
          
          return {
            ...prevState,
            display: formatNumber(newValue),
            previousValue: newValue,
            operation: nextOperation,
            waitingForOperand: true,
            history: [historyEntry, ...prevState.history.slice(0, 9)], // Keep last 10 entries
          }
        } catch (error) {
          return {
            ...prevState,
            display: 'Error',
            previousValue: null,
            operation: null,
            waitingForOperand: true,
          }
        }
      }
      
      return prevState
    })
  }, [calculate, formatNumber])

  // Keyboard event handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return

    event.preventDefault()
    
    const { key } = event
    
    if (key >= '0' && key <= '9') {
      inputNumber(key)
    } else if (key === '.') {
      inputDecimal()
    } else if (key === '+') {
      performOperation('+')
    } else if (key === '-') {
      performOperation('-')
    } else if (key === '*') {
      performOperation('*')
    } else if (key === '/') {
      performOperation('/')
    } else if (key === 'Enter' || key === '=') {
      performOperation('=')
    } else if (key === 'Escape') {
      clear()
    } else if (key === 'Backspace') {
      backspace()
    } else if (key === 'Delete') {
      clearEntry()
    }
  }, [isOpen, inputNumber, inputDecimal, performOperation, clear, backspace, clearEntry])

  // Add keyboard event listeners
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  const buttonStyle = {
    minHeight: 48,
    fontSize: '1.1rem',
    fontWeight: 600,
    borderRadius: 1,
  }

  const numberButtonStyle = {
    ...buttonStyle,
    backgroundColor: 'background.paper',
    color: 'text.primary',
    border: `1px solid ${theme.palette.divider}`,
    '&:hover': {
      backgroundColor: 'action.hover',
    },
  }

  const operatorButtonStyle = {
    ...buttonStyle,
    backgroundColor: 'primary.main',
    color: 'primary.contrastText',
    '&:hover': {
      backgroundColor: 'primary.dark',
    },
  }

  const specialButtonStyle = {
    ...buttonStyle,
    backgroundColor: 'warning.main',
    color: 'warning.contrastText',
    '&:hover': {
      backgroundColor: 'warning.dark',
    },
  }

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

        {/* Display */}
        <Box sx={{ p: 2 }}>
          <Paper 
            elevation={1} 
            sx={{ 
              p: 2, 
              backgroundColor: 'grey.50',
              border: `1px solid ${theme.palette.divider}`
            }}
          >
            <TextField
              value={state.display}
              variant="outlined"
              fullWidth
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
                    fontSize: '1.5rem',
                    fontWeight: 600,
                    color: 'text.primary',
                    fontFamily: 'monospace',
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
        </Box>

        {/* Button Grid */}
        <Box sx={{ flex: 1, p: 2, paddingTop: 0 }}>
          <Grid container spacing={1}>
            {/* Row 1 */}
            <Grid item xs={6}>
              <Button
                fullWidth
                onClick={clear}
                sx={specialButtonStyle}
                startIcon={<ClearIcon />}
              >
                Clear
              </Button>
            </Grid>
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={clearEntry}
                sx={specialButtonStyle}
              >
                CE
              </Button>
            </Grid>
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={backspace}
                sx={specialButtonStyle}
              >
                <BackspaceIcon />
              </Button>
            </Grid>

            {/* Row 2 */}
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={() => inputNumber('7')}
                sx={numberButtonStyle}
              >
                7
              </Button>
            </Grid>
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={() => inputNumber('8')}
                sx={numberButtonStyle}
              >
                8
              </Button>
            </Grid>
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={() => inputNumber('9')}
                sx={numberButtonStyle}
              >
                9
              </Button>
            </Grid>
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={() => performOperation('/')}
                sx={operatorButtonStyle}
              >
                ÷
              </Button>
            </Grid>

            {/* Row 3 */}
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={() => inputNumber('4')}
                sx={numberButtonStyle}
              >
                4
              </Button>
            </Grid>
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={() => inputNumber('5')}
                sx={numberButtonStyle}
              >
                5
              </Button>
            </Grid>
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={() => inputNumber('6')}
                sx={numberButtonStyle}
              >
                6
              </Button>
            </Grid>
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={() => performOperation('*')}
                sx={operatorButtonStyle}
              >
                ×
              </Button>
            </Grid>

            {/* Row 4 */}
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={() => inputNumber('1')}
                sx={numberButtonStyle}
              >
                1
              </Button>
            </Grid>
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={() => inputNumber('2')}
                sx={numberButtonStyle}
              >
                2
              </Button>
            </Grid>
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={() => inputNumber('3')}
                sx={numberButtonStyle}
              >
                3
              </Button>
            </Grid>
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={() => performOperation('-')}
                sx={operatorButtonStyle}
              >
                −
              </Button>
            </Grid>

            {/* Row 5 */}
            <Grid item xs={6}>
              <Button
                fullWidth
                onClick={() => inputNumber('0')}
                sx={numberButtonStyle}
              >
                0
              </Button>
            </Grid>
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={inputDecimal}
                sx={numberButtonStyle}
              >
                .
              </Button>
            </Grid>
            <Grid item xs={3}>
              <Button
                fullWidth
                onClick={() => performOperation('+')}
                sx={operatorButtonStyle}
              >
                +
              </Button>
            </Grid>

            {/* Row 6 - Equals */}
            <Grid item xs={12}>
              <Button
                fullWidth
                onClick={() => performOperation('=')}
                sx={{
                  ...buttonStyle,
                  backgroundColor: 'success.main',
                  color: 'success.contrastText',
                  '&:hover': {
                    backgroundColor: 'success.dark',
                  },
                  minHeight: 56,
                  fontSize: '1.2rem',
                }}
              >
                =
              </Button>
            </Grid>
          </Grid>
        </Box>

        {/* History */}
        {state.history.length > 0 && (
          <>
            <Divider />
            <Box sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                History
              </Typography>
              <Box sx={{ maxHeight: 120, overflowY: 'auto' }}>
                {state.history.slice(0, 5).map((entry, index) => (
                  <Typography
                    key={index}
                    variant="caption"
                    sx={{
                      display: 'block',
                      fontFamily: 'monospace',
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
        )}

        {/* Keyboard shortcuts help */}
        <Divider />
        <Box sx={{ p: 2, backgroundColor: 'grey.50' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Keyboard shortcuts:
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            Numbers (0-9) • Operators (+, -, *, /) • Enter/= (equals) • Esc (clear) • Backspace • Delete (CE)
          </Typography>
        </Box>
      </Box>
    </Drawer>
  )
}

export default SlidingCalculatorPanel