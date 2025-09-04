import React, { useState, useEffect, useRef } from 'react'
import {
  Box,
  Paper,
  Button,
  Typography,
  Grid,
} from '@mui/material'

interface CalculatorProps {
  onCalculatorClose?: () => void
}

const Calculator: React.FC<CalculatorProps> = ({ onCalculatorClose }) => {
  const [display, setDisplay] = useState('0')
  const [previousValue, setPreviousValue] = useState<number | null>(null)
  const [operation, setOperation] = useState<string | null>(null)
  const [waitingForOperand, setWaitingForOperand] = useState(false)
  const calculatorRef = useRef<HTMLDivElement>(null)

  const inputNumber = (num: string) => {
    if (waitingForOperand) {
      setDisplay(String(num))
      setWaitingForOperand(false)
    } else {
      setDisplay(display === '0' ? String(num) : display + num)
    }
  }

  const inputDecimal = () => {
    if (waitingForOperand) {
      setDisplay('0.')
      setWaitingForOperand(false)
    } else if (display.indexOf('.') === -1) {
      setDisplay(display + '.')
    }
  }

  const clear = () => {
    setDisplay('0')
    setPreviousValue(null)
    setOperation(null)
    setWaitingForOperand(false)
  }

  const performOperation = (nextOperation: string) => {
    const inputValue = parseFloat(display)

    if (previousValue === null) {
      setPreviousValue(inputValue)
    } else if (operation) {
      const currentValue = previousValue || 0
      const newValue = calculate(currentValue, inputValue, operation)

      setDisplay(String(newValue))
      setPreviousValue(newValue)
    }

    setWaitingForOperand(true)
    setOperation(nextOperation)
  }

  const calculate = (firstValue: number, secondValue: number, operation: string): number => {
    switch (operation) {
      case '+':
        return firstValue + secondValue
      case '-':
        return firstValue - secondValue
      case '*':
        return firstValue * secondValue
      case '/':
        return firstValue / secondValue
      case '=':
        return secondValue
      default:
        return secondValue
    }
  }

  const handleOperationClick = (op: string) => {
    if (op === '=') {
      if (operation && previousValue !== null) {
        const inputValue = parseFloat(display)
        const newValue = calculate(previousValue, inputValue, operation)
        setDisplay(String(newValue))
        setPreviousValue(null)
        setOperation(null)
        setWaitingForOperand(true)
      }
    } else {
      performOperation(op)
    }
  }

  const handleBackspace = () => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1))
    } else {
      setDisplay('0')
    }
  }

  const handleKeyPress = (event: KeyboardEvent) => {
    event.preventDefault()
    
    const key = event.key
    
    // Numbers
    if (key >= '0' && key <= '9') {
      inputNumber(key)
    }
    // Decimal point
    else if (key === '.') {
      inputDecimal()
    }
    // Operations
    else if (key === '+') {
      handleOperationClick('+')
    }
    else if (key === '-') {
      handleOperationClick('-')
    }
    else if (key === '*' || key === 'x' || key === 'X') {
      handleOperationClick('*')
    }
    else if (key === '/') {
      handleOperationClick('/')
    }
    // Equals
    else if (key === '=' || key === 'Enter') {
      handleOperationClick('=')
    }
    // Clear
    else if (key === 'c' || key === 'C' || key === 'Delete') {
      clear()
    }
    // Backspace
    else if (key === 'Backspace') {
      handleBackspace()
    }
    // Close calculator
    else if (key === 'Escape') {
      if (onCalculatorClose) {
        onCalculatorClose()
      }
    }
  }

  // Add keyboard event listeners
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle keys if the calculator is focused or if it's a global shortcut
      const isCalculatorFocused = calculatorRef.current?.contains(document.activeElement)
      const isGlobalShortcut = event.key === 'Escape'
      
      if (isCalculatorFocused || isGlobalShortcut) {
        handleKeyPress(event)
      }
    }

    // Focus the calculator when it mounts
    if (calculatorRef.current) {
      calculatorRef.current.focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [display, operation, previousValue, waitingForOperand, onCalculatorClose])

  const buttonStyle = {
    minHeight: 48,
    fontSize: '1.1rem',
    fontWeight: 500,
  }

  const operatorButtonStyle = {
    ...buttonStyle,
    backgroundColor: 'primary.main',
    color: 'white',
    '&:hover': {
      backgroundColor: 'primary.dark',
    },
  }

  const numberButtonStyle = {
    ...buttonStyle,
    backgroundColor: 'grey.100',
    color: 'text.primary',
    '&:hover': {
      backgroundColor: 'grey.200',
    },
  }

  const functionButtonStyle = {
    ...buttonStyle,
    backgroundColor: 'grey.300',
    color: 'text.primary',
    '&:hover': {
      backgroundColor: 'grey.400',
    },
  }

  return (
    <Paper 
      ref={calculatorRef}
      tabIndex={0}
      sx={{ 
        p: 2, 
        width: 280,
        outline: 'none',
        '&:focus': {
          outline: 'none',
        }
      }}
    >
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, textAlign: 'center' }}>
          Calculator
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'text.secondary', mb: 1 }}>
          Use keyboard for input • ESC to close
        </Typography>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            backgroundColor: 'grey.900',
            color: 'white',
            textAlign: 'right',
            minHeight: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <Typography
            variant="h4"
            sx={{
              fontFamily: 'monospace',
              fontWeight: 400,
              wordBreak: 'break-all',
              fontSize: display.length > 10 ? '1.5rem' : '2rem',
            }}
          >
            {display}
          </Typography>
        </Paper>
      </Box>

      <Grid container spacing={1}>
        {/* First Row */}
        <Grid item xs={6}>
          <Button
            fullWidth
            variant="contained"
            onClick={clear}
            sx={functionButtonStyle}
          >
            Clear
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => handleOperationClick('/')}
            sx={operatorButtonStyle}
          >
            ÷
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => handleOperationClick('*')}
            sx={operatorButtonStyle}
          >
            ×
          </Button>
        </Grid>

        {/* Second Row */}
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => inputNumber('7')}
            sx={numberButtonStyle}
          >
            7
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => inputNumber('8')}
            sx={numberButtonStyle}
          >
            8
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => inputNumber('9')}
            sx={numberButtonStyle}
          >
            9
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => handleOperationClick('-')}
            sx={operatorButtonStyle}
          >
            −
          </Button>
        </Grid>

        {/* Third Row */}
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => inputNumber('4')}
            sx={numberButtonStyle}
          >
            4
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => inputNumber('5')}
            sx={numberButtonStyle}
          >
            5
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => inputNumber('6')}
            sx={numberButtonStyle}
          >
            6
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => handleOperationClick('+')}
            sx={operatorButtonStyle}
          >
            +
          </Button>
        </Grid>

        {/* Fourth Row */}
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => inputNumber('1')}
            sx={numberButtonStyle}
          >
            1
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => inputNumber('2')}
            sx={numberButtonStyle}
          >
            2
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => inputNumber('3')}
            sx={numberButtonStyle}
          >
            3
          </Button>
        </Grid>
        <Grid item xs={3} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => handleOperationClick('=')}
            sx={{
              ...operatorButtonStyle,
              minHeight: 100,
            }}
          >
            =
          </Button>
        </Grid>

        {/* Fifth Row */}
        <Grid item xs={6}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => inputNumber('0')}
            sx={numberButtonStyle}
          >
            0
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={inputDecimal}
            sx={numberButtonStyle}
          >
            .
          </Button>
        </Grid>
      </Grid>
    </Paper>
  )
}

export default Calculator