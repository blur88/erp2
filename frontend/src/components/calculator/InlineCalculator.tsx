import React, { useState, useCallback } from 'react'
import {
  Box,
  Button,
  TextField,
  InputAdornment,
  Grid,
  Paper,
  Typography,
  useTheme,
} from '@mui/material'
import {
  Clear as ClearIcon,
  Backspace as BackspaceIcon,
} from '@mui/icons-material'

type CalculatorOperation = '+' | '-' | '*' | '/' | '='

interface CalculatorState {
  display: string
  previousValue: number | null
  operation: CalculatorOperation | null
  waitingForOperand: boolean
}

const initialState: CalculatorState = {
  display: '0',
  previousValue: null,
  operation: null,
  waitingForOperand: false,
}

const InlineCalculator: React.FC = () => {
  const theme = useTheme()
  const [state, setState] = useState<CalculatorState>(initialState)
  
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
          
          return {
            ...prevState,
            display: formatNumber(newValue),
            previousValue: newValue,
            operation: nextOperation,
            waitingForOperand: true,
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

  const buttonStyle = {
    minHeight: 40,
    fontSize: '0.9rem',
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
    <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, height: 'fit-content' }}>
      <Typography variant="h6" sx={{ mb: 2, fontSize: '1rem', fontWeight: 600 }}>
        Calculator
      </Typography>
      
      {/* Display */}
      <Paper elevation={1} sx={{ p: 1.5, mb: 2, backgroundColor: 'background.paper' }}>
        <TextField
          value={state.display}
          variant="outlined"
          fullWidth
          size="small"
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
                fontSize: '1.2rem',
                fontWeight: 600,
                color: 'text.primary',
                fontFamily: 'monospace',
              }
            }
          }}
        />
      </Paper>

      {/* Button Grid */}
      <Grid container spacing={1}>
        {/* Row 1 */}
        <Grid item xs={6}>
          <Button
            fullWidth
            onClick={clear}
            sx={specialButtonStyle}
            startIcon={<ClearIcon fontSize="small" />}
          >
            Clear
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Button
            fullWidth
            onClick={() => setState(prev => ({ ...prev, display: '0' }))}
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
            <BackspaceIcon fontSize="small" />
          </Button>
        </Grid>

        {/* Row 2 */}
        <Grid item xs={3}>
          <Button fullWidth onClick={() => inputNumber('7')} sx={numberButtonStyle}>7</Button>
        </Grid>
        <Grid item xs={3}>
          <Button fullWidth onClick={() => inputNumber('8')} sx={numberButtonStyle}>8</Button>
        </Grid>
        <Grid item xs={3}>
          <Button fullWidth onClick={() => inputNumber('9')} sx={numberButtonStyle}>9</Button>
        </Grid>
        <Grid item xs={3}>
          <Button fullWidth onClick={() => performOperation('/')} sx={operatorButtonStyle}>÷</Button>
        </Grid>

        {/* Row 3 */}
        <Grid item xs={3}>
          <Button fullWidth onClick={() => inputNumber('4')} sx={numberButtonStyle}>4</Button>
        </Grid>
        <Grid item xs={3}>
          <Button fullWidth onClick={() => inputNumber('5')} sx={numberButtonStyle}>5</Button>
        </Grid>
        <Grid item xs={3}>
          <Button fullWidth onClick={() => inputNumber('6')} sx={numberButtonStyle}>6</Button>
        </Grid>
        <Grid item xs={3}>
          <Button fullWidth onClick={() => performOperation('*')} sx={operatorButtonStyle}>×</Button>
        </Grid>

        {/* Row 4 */}
        <Grid item xs={3}>
          <Button fullWidth onClick={() => inputNumber('1')} sx={numberButtonStyle}>1</Button>
        </Grid>
        <Grid item xs={3}>
          <Button fullWidth onClick={() => inputNumber('2')} sx={numberButtonStyle}>2</Button>
        </Grid>
        <Grid item xs={3}>
          <Button fullWidth onClick={() => inputNumber('3')} sx={numberButtonStyle}>3</Button>
        </Grid>
        <Grid item xs={3}>
          <Button fullWidth onClick={() => performOperation('-')} sx={operatorButtonStyle}>−</Button>
        </Grid>

        {/* Row 5 */}
        <Grid item xs={6}>
          <Button fullWidth onClick={() => inputNumber('0')} sx={numberButtonStyle}>0</Button>
        </Grid>
        <Grid item xs={3}>
          <Button fullWidth onClick={inputDecimal} sx={numberButtonStyle}>.</Button>
        </Grid>
        <Grid item xs={3}>
          <Button fullWidth onClick={() => performOperation('+')} sx={operatorButtonStyle}>+</Button>
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
              minHeight: 48,
              fontSize: '1.1rem',
            }}
          >
            =
          </Button>
        </Grid>
      </Grid>
    </Box>
  )
}

export default InlineCalculator