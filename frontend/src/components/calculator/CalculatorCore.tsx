import React, { useState, useEffect, useRef } from 'react'
import {
  Box,
  Paper,
  Button,
  Typography,
  Grid,
  IconButton,
  Fade,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material'
import {
  Backspace as BackspaceIcon,
} from '@mui/icons-material'

interface CalculatorCoreProps {
  onCalculatorClose?: () => void
  compact?: boolean
}

const CalculatorCore: React.FC<CalculatorCoreProps> = ({ onCalculatorClose, compact = false }) => {
  const [display, setDisplay] = useState('0')
  const [previousValue, setPreviousValue] = useState<number | null>(null)
  const [operation, setOperation] = useState<string | null>(null)
  const [waitingForOperand, setWaitingForOperand] = useState(false)
  const [history, setHistory] = useState<string>('')
  const [animateButton, setAnimateButton] = useState<string | null>(null)
  const calculatorRef = useRef<HTMLDivElement>(null)
  const theme = useTheme()

  const inputNumber = (num: string) => {
    animateButtonPress(num)
    if (waitingForOperand) {
      setDisplay(String(num))
      setWaitingForOperand(false)
    } else {
      if (num === '00' && display === '0') {
        setDisplay('0')
      } else {
        setDisplay(display === '0' ? String(num) : display + num)
      }
    }
  }

  const inputDecimal = () => {
    animateButtonPress('.')
    if (waitingForOperand) {
      setDisplay('0.')
      setWaitingForOperand(false)
    } else if (display.indexOf('.') === -1) {
      setDisplay(display + '.')
    }
  }

  const clear = () => {
    animateButtonPress('clear')
    setDisplay('0')
    setPreviousValue(null)
    setOperation(null)
    setWaitingForOperand(false)
    setHistory('')
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

  const getOperatorSymbol = (op: string): string => {
    switch (op) {
      case '+': return '+'
      case '-': return '−'
      case '*': return '×'
      case '/': return '÷'
      default: return op
    }
  }

  const performOperation = (nextOperation: string) => {
    const inputValue = parseFloat(display)

    if (previousValue === null) {
      setPreviousValue(inputValue)
      setHistory(`${inputValue} ${getOperatorSymbol(nextOperation)}`)
    } else if (operation) {
      const currentValue = previousValue || 0
      const newValue = calculate(currentValue, inputValue, operation)
      
      setDisplay(String(newValue))
      setPreviousValue(newValue)
      setHistory(`${newValue} ${getOperatorSymbol(nextOperation)}`)
    }

    setWaitingForOperand(true)
    setOperation(nextOperation)
  }

  const handleOperationClick = (op: string) => {
    animateButtonPress(op)
    
    if (op === '=') {
      if (operation && previousValue !== null) {
        const inputValue = parseFloat(display)
        const newValue = calculate(previousValue, inputValue, operation)
        const operationText = `${previousValue} ${getOperatorSymbol(operation)} ${inputValue} = ${newValue}`
        
        setDisplay(String(newValue))
        setHistory(operationText)
        setPreviousValue(null)
        setOperation(null)
        setWaitingForOperand(true)
      }
    } else {
      performOperation(op)
    }
  }

  const handleBackspace = () => {
    animateButtonPress('backspace')
    if (display.length > 1) {
      setDisplay(display.slice(0, -1))
    } else {
      setDisplay('0')
    }
  }

  const handleKeyPress = (event: KeyboardEvent) => {
    event.preventDefault()
    
    const key = event.key
    
    if (key >= '0' && key <= '9') {
      inputNumber(key)
    } else if (key === '.') {
      inputDecimal()
    } else if (key === '+') {
      handleOperationClick('+')
    } else if (key === '-') {
      handleOperationClick('-')
    } else if (key === '*' || key === 'x' || key === 'X') {
      handleOperationClick('*')
    } else if (key === '/') {
      handleOperationClick('/')
    } else if (key === '=' || key === 'Enter') {
      handleOperationClick('=')
    } else if (key === 'c' || key === 'C' || key === 'Delete') {
      clear()
    } else if (key === 'Backspace') {
      handleBackspace()
    } else if (key === 'Escape') {
      if (onCalculatorClose) {
        onCalculatorClose()
      }
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCalculatorFocused = calculatorRef.current?.contains(document.activeElement)
      const isGlobalShortcut = event.key === 'Escape'
      
      if (isCalculatorFocused || isGlobalShortcut) {
        handleKeyPress(event)
      }
    }

    if (calculatorRef.current) {
      calculatorRef.current.focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [display, operation, previousValue, waitingForOperand, onCalculatorClose])

  const animateButtonPress = (buttonId: string) => {
    setAnimateButton(buttonId)
    setTimeout(() => setAnimateButton(null), 150)
  }

  const buttonHeight = compact ? 50 : 60
  const fontSize = compact ? '1rem' : '1.2rem'
  
  const baseButtonStyle = {
    minHeight: buttonHeight,
    fontSize: fontSize,
    fontWeight: 500,
    borderRadius: '8px',
    border: 'none',
    transition: 'all 0.15s ease-in-out',
    boxShadow: 'none',
    '&:hover': {
      transform: 'translateY(-1px)',
      boxShadow: theme.shadows[2],
    },
    '&:active': {
      transform: 'translateY(0)',
      boxShadow: theme.shadows[1],
    },
  }

  const numberButtonStyle = {
    ...baseButtonStyle,
    backgroundColor: theme.palette.grey[100],
    color: theme.palette.text.primary,
    '&:hover': {
      backgroundColor: theme.palette.grey[200],
      transform: 'translateY(-1px)',
      boxShadow: theme.shadows[2],
    },
  }

  const operatorButtonStyle = {
    ...baseButtonStyle,
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    fontWeight: 600,
    '&:hover': {
      backgroundColor: theme.palette.primary.dark,
      transform: 'translateY(-1px)',
      boxShadow: theme.shadows[2],
    },
  }

  const equalsButtonStyle = {
    ...baseButtonStyle,
    backgroundColor: theme.palette.success.main,
    color: theme.palette.success.contrastText,
    fontWeight: 600,
    fontSize: compact ? '1.2rem' : '1.4rem',
    '&:hover': {
      backgroundColor: theme.palette.success.dark,
      transform: 'translateY(-1px)',
      boxShadow: theme.shadows[2],
    },
  }

  const functionButtonStyle = {
    ...baseButtonStyle,
    backgroundColor: theme.palette.grey[300],
    color: theme.palette.text.primary,
    fontWeight: 600,
    '&:hover': {
      backgroundColor: theme.palette.grey[400],
      transform: 'translateY(-1px)',
      boxShadow: theme.shadows[2],
    },
  }

  return (
    <Paper 
      ref={calculatorRef}
      tabIndex={0}
      elevation={3}
      sx={{ 
        p: compact ? 2 : 3, 
        width: compact ? 280 : 300,
        outline: 'none',
        borderRadius: 3,
        backgroundColor: theme.palette.background.paper,
        '&:focus': {
          outline: 'none',
        }
      }}
    >
      <Box sx={{ mb: compact ? 2 : 3 }}>
        <Typography variant="h6" sx={{ 
          fontWeight: 700, 
          mb: 0.5, 
          textAlign: 'center',
          color: theme.palette.text.primary,
          letterSpacing: '-0.025em',
          fontSize: compact ? '1rem' : '1.25rem'
        }}>
          Calculator
        </Typography>
        <Typography variant="caption" sx={{ 
          display: 'block', 
          textAlign: 'center', 
          color: theme.palette.text.secondary, 
          mb: 2,
          fontSize: '0.7rem'
        }}>
          Use keyboard for input • ESC to close
        </Typography>
        
        <Fade in={!!history}>
          <Box sx={{ 
            minHeight: compact ? 20 : 24,
            mb: 1,
            px: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end'
          }}>
            <Typography
              variant="caption"
              sx={{
                fontFamily: 'monospace',
                color: theme.palette.text.secondary,
                fontSize: '0.75rem',
                opacity: history ? 1 : 0,
                transition: 'opacity 0.3s'
              }}
            >
              {history}
            </Typography>
          </Box>
        </Fade>
        
        <Paper
          elevation={1}
          sx={{
            p: compact ? 2 : 2.5,
            backgroundColor: theme.palette.grey[900],
            color: 'white',
            textAlign: 'right',
            minHeight: compact ? 60 : 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            borderRadius: 2,
            position: 'relative',
          }}
        >
          <Typography
            variant="h4"
            sx={{
              fontFamily: 'monospace',
              fontWeight: 400,
              wordBreak: 'break-all',
              fontSize: display.length > 12 ? (compact ? '1.1rem' : '1.3rem') : display.length > 8 ? (compact ? '1.5rem' : '1.8rem') : (compact ? '1.8rem' : '2.2rem'),
              transition: 'font-size 0.2s ease',
            }}
          >
            {display}
          </Typography>
          
          <Tooltip title="Backspace (⌫)">
            <IconButton
              onClick={handleBackspace}
              size="small"
              sx={{
                position: 'absolute',
                top: 6,
                right: 6,
                color: alpha(theme.palette.common.white, 0.7),
                '&:hover': {
                  color: theme.palette.common.white,
                  backgroundColor: alpha(theme.palette.common.white, 0.1)
                }
              }}
            >
              <BackspaceIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Paper>
      </Box>

      <Grid container spacing={compact ? 1 : 1.5}>
        <Grid item xs={3}>
          <Tooltip title="Clear All (C or Delete)">
            <Button
              fullWidth
              variant="contained"
              onClick={clear}
              sx={{
                ...functionButtonStyle,
                transform: animateButton === 'clear' ? 'scale(0.95)' : 'scale(1)',
              }}
            >
              C
            </Button>
          </Tooltip>
        </Grid>
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            disabled
            sx={{
              ...functionButtonStyle,
              opacity: 0.3,
            }}
          >
            ±
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            disabled
            sx={{
              ...functionButtonStyle,
              opacity: 0.3,
            }}
          >
            %
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Tooltip title="Divide (/)">
            <Button
              fullWidth
              variant="contained"
              onClick={() => handleOperationClick('/')}
              sx={{
                ...operatorButtonStyle,
                transform: animateButton === '/' ? 'scale(0.95)' : 'scale(1)',
              }}
            >
              ÷
            </Button>
          </Tooltip>
        </Grid>

        {[7, 8, 9].map((num) => (
          <Grid item xs={3} key={num}>
            <Button
              fullWidth
              variant="contained"
              onClick={() => inputNumber(String(num))}
              sx={{
                ...numberButtonStyle,
                transform: animateButton === String(num) ? 'scale(0.95)' : 'scale(1)',
              }}
            >
              {num}
            </Button>
          </Grid>
        ))}
        <Grid item xs={3}>
          <Tooltip title="Multiply (* or x)">
            <Button
              fullWidth
              variant="contained"
              onClick={() => handleOperationClick('*')}
              sx={{
                ...operatorButtonStyle,
                transform: animateButton === '*' ? 'scale(0.95)' : 'scale(1)',
              }}
            >
              ×
            </Button>
          </Tooltip>
        </Grid>

        {[4, 5, 6].map((num) => (
          <Grid item xs={3} key={num}>
            <Button
              fullWidth
              variant="contained"
              onClick={() => inputNumber(String(num))}
              sx={{
                ...numberButtonStyle,
                transform: animateButton === String(num) ? 'scale(0.95)' : 'scale(1)',
              }}
            >
              {num}
            </Button>
          </Grid>
        ))}
        <Grid item xs={3}>
          <Tooltip title="Subtract (-)">
            <Button
              fullWidth
              variant="contained"
              onClick={() => handleOperationClick('-')}
              sx={{
                ...operatorButtonStyle,
                transform: animateButton === '-' ? 'scale(0.95)' : 'scale(1)',
              }}
            >
              −
            </Button>
          </Tooltip>
        </Grid>

        {[1, 2, 3].map((num) => (
          <Grid item xs={3} key={num}>
            <Button
              fullWidth
              variant="contained"
              onClick={() => inputNumber(String(num))}
              sx={{
                ...numberButtonStyle,
                transform: animateButton === String(num) ? 'scale(0.95)' : 'scale(1)',
              }}
            >
              {num}
            </Button>
          </Grid>
        ))}
        <Grid item xs={3}>
          <Tooltip title="Add (+)">
            <Button
              fullWidth
              variant="contained"
              onClick={() => handleOperationClick('+')}
              sx={{
                ...operatorButtonStyle,
                transform: animateButton === '+' ? 'scale(0.95)' : 'scale(1)',
              }}
            >
              +
            </Button>
          </Tooltip>
        </Grid>

        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => inputNumber('0')}
            sx={{
              ...numberButtonStyle,
              transform: animateButton === '0' ? 'scale(0.95)' : 'scale(1)',
            }}
          >
            0
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => inputNumber('00')}
            sx={{
              ...numberButtonStyle,
              transform: animateButton === '00' ? 'scale(0.95)' : 'scale(1)',
            }}
          >
            00
          </Button>
        </Grid>
        <Grid item xs={3}>
          <Tooltip title="Decimal point (.)">
            <Button
              fullWidth
              variant="contained"
              onClick={inputDecimal}
              sx={{
                ...numberButtonStyle,
                transform: animateButton === '.' ? 'scale(0.95)' : 'scale(1)',
                fontSize: compact ? '1.3rem' : '1.6rem',
                fontWeight: 700,
              }}
            >
              .
            </Button>
          </Tooltip>
        </Grid>
        <Grid item xs={3}>
          <Tooltip title="Equals (= or Enter)">
            <Button
              fullWidth
              variant="contained"
              onClick={() => handleOperationClick('=')}
              sx={{
                ...equalsButtonStyle,
                transform: animateButton === '=' ? 'scale(0.95)' : 'scale(1)',
              }}
            >
              =
            </Button>
          </Tooltip>
        </Grid>
      </Grid>
    </Paper>
  )
}

export default CalculatorCore