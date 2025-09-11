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
  Slide,
} from '@mui/material'
import {
  Backspace as BackspaceIcon,
  Close as CloseIcon,
} from '@mui/icons-material'

interface SlidingCalculatorPanelProps {
  isOpen: boolean
  onClose: () => void
}

const SlidingCalculatorPanel: React.FC<SlidingCalculatorPanelProps> = ({ isOpen, onClose }) => {
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

  const calculate = (firstValue: number, secondValue: number, operation: string): number => {
    switch (operation) {
      case '+':
        return firstValue + secondValue
      case '-':
        return firstValue - secondValue
      case '*':
        return firstValue * secondValue
      case '/':
        return secondValue !== 0 ? firstValue / secondValue : 0
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
    // Only handle keys when calculator is open and focused
    if (!isOpen) return
    
    const key = event.key
    
    // Numbers
    if (key >= '0' && key <= '9') {
      event.preventDefault()
      inputNumber(key)
    }
    // Decimal point
    else if (key === '.') {
      event.preventDefault()
      inputDecimal()
    }
    // Operations
    else if (key === '+') {
      event.preventDefault()
      handleOperationClick('+')
    }
    else if (key === '-') {
      event.preventDefault()
      handleOperationClick('-')
    }
    else if (key === '*' || key === 'x' || key === 'X') {
      event.preventDefault()
      handleOperationClick('*')
    }
    else if (key === '/') {
      event.preventDefault()
      handleOperationClick('/')
    }
    // Equals
    else if (key === '=' || key === 'Enter') {
      event.preventDefault()
      handleOperationClick('=')
    }
    // Clear
    else if (key === 'c' || key === 'C' || key === 'Delete') {
      event.preventDefault()
      clear()
    }
    // Backspace
    else if (key === 'Backspace') {
      event.preventDefault()
      handleBackspace()
    }
    // Close calculator
    else if (key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  // Add keyboard event listeners when calculator is open
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyPress)
      // Focus the calculator when it opens
      if (calculatorRef.current) {
        calculatorRef.current.focus()
      }
    }

    return () => {
      document.removeEventListener('keydown', handleKeyPress)
    }
  }, [isOpen, display, operation, previousValue, waitingForOperand])

  const animateButtonPress = (buttonId: string) => {
    setAnimateButton(buttonId)
    setTimeout(() => setAnimateButton(null), 150)
  }

  const baseButtonStyle = {
    minHeight: 50,
    fontSize: '1.1rem',
    fontWeight: 500,
    borderRadius: '6px',
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
    fontSize: '1.3rem',
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
    <>
      {/* Backdrop */}
      {isOpen && (
        <Box
          onClick={onClose}
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: alpha(theme.palette.common.black, 0.3),
            backdropFilter: 'blur(2px)',
            zIndex: 1200,
            transition: 'all 0.3s ease-in-out',
          }}
        />
      )}
      
      {/* Sliding Panel */}
      <Slide direction="left" in={isOpen} mountOnEnter unmountOnExit>
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            right: 0,
            height: '100vh',
            width: 320,
            zIndex: 1300,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Paper
            ref={calculatorRef}
            tabIndex={0}
            elevation={8}
            sx={{
              height: '100%',
              borderRadius: '0 0 0 16px',
              outline: 'none',
              backgroundColor: theme.palette.background.paper,
              display: 'flex',
              flexDirection: 'column',
              '&:focus': {
                outline: 'none',
              }
            }}
          >
            {/* Header */}
            <Box sx={{ 
              p: 2, 
              borderBottom: `1px solid ${theme.palette.divider}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 56
            }}>
              <Typography variant="h6" sx={{ 
                fontWeight: 700, 
                color: theme.palette.text.primary,
                letterSpacing: '-0.025em',
                fontSize: '1.1rem'
              }}>
                Calculator
              </Typography>
              <IconButton
                onClick={onClose}
                size="small"
                sx={{
                  color: theme.palette.text.secondary,
                  '&:hover': {
                    color: theme.palette.error.main,
                    backgroundColor: alpha(theme.palette.error.main, 0.1)
                  }
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>

            {/* Calculator Body */}
            <Box sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="caption" sx={{ 
                display: 'block', 
                textAlign: 'center', 
                color: theme.palette.text.secondary, 
                mb: 2,
                fontSize: '0.7rem'
              }}>
                Use keyboard for input • ESC to close
              </Typography>
              
              {/* History Display */}
              <Fade in={!!history}>
                <Box sx={{ 
                  minHeight: 20,
                  mb: 1,
                  px: 1,
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
              
              {/* Main Display */}
              <Paper
                elevation={1}
                sx={{
                  p: 2,
                  backgroundColor: theme.palette.grey[900],
                  color: 'white',
                  textAlign: 'right',
                  minHeight: 60,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  borderRadius: 2,
                  position: 'relative',
                  mb: 2,
                }}
              >
                <Typography
                  variant="h4"
                  sx={{
                    fontFamily: 'monospace',
                    fontWeight: 400,
                    wordBreak: 'break-all',
                    fontSize: display.length > 12 ? '1.2rem' : display.length > 8 ? '1.6rem' : '2rem',
                    transition: 'font-size 0.2s ease',
                  }}
                >
                  {display}
                </Typography>
                
                {/* Backspace Button in Display */}
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

              {/* Calculator Grid */}
              <Box sx={{ flex: 1 }}>
                <Grid container spacing={1}>
                  {/* First Row - Function buttons */}
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

                  {/* Second Row */}
                  <Grid item xs={3}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => inputNumber('7')}
                      sx={{
                        ...numberButtonStyle,
                        transform: animateButton === '7' ? 'scale(0.95)' : 'scale(1)',
                      }}
                    >
                      7
                    </Button>
                  </Grid>
                  <Grid item xs={3}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => inputNumber('8')}
                      sx={{
                        ...numberButtonStyle,
                        transform: animateButton === '8' ? 'scale(0.95)' : 'scale(1)',
                      }}
                    >
                      8
                    </Button>
                  </Grid>
                  <Grid item xs={3}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => inputNumber('9')}
                      sx={{
                        ...numberButtonStyle,
                        transform: animateButton === '9' ? 'scale(0.95)' : 'scale(1)',
                      }}
                    >
                      9
                    </Button>
                  </Grid>
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

                  {/* Third Row */}
                  <Grid item xs={3}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => inputNumber('4')}
                      sx={{
                        ...numberButtonStyle,
                        transform: animateButton === '4' ? 'scale(0.95)' : 'scale(1)',
                      }}
                    >
                      4
                    </Button>
                  </Grid>
                  <Grid item xs={3}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => inputNumber('5')}
                      sx={{
                        ...numberButtonStyle,
                        transform: animateButton === '5' ? 'scale(0.95)' : 'scale(1)',
                      }}
                    >
                      5
                    </Button>
                  </Grid>
                  <Grid item xs={3}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => inputNumber('6')}
                      sx={{
                        ...numberButtonStyle,
                        transform: animateButton === '6' ? 'scale(0.95)' : 'scale(1)',
                      }}
                    >
                      6
                    </Button>
                  </Grid>
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

                  {/* Fourth Row */}
                  <Grid item xs={3}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => inputNumber('1')}
                      sx={{
                        ...numberButtonStyle,
                        transform: animateButton === '1' ? 'scale(0.95)' : 'scale(1)',
                      }}
                    >
                      1
                    </Button>
                  </Grid>
                  <Grid item xs={3}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => inputNumber('2')}
                      sx={{
                        ...numberButtonStyle,
                        transform: animateButton === '2' ? 'scale(0.95)' : 'scale(1)',
                      }}
                    >
                      2
                    </Button>
                  </Grid>
                  <Grid item xs={3}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => inputNumber('3')}
                      sx={{
                        ...numberButtonStyle,
                        transform: animateButton === '3' ? 'scale(0.95)' : 'scale(1)',
                      }}
                    >
                      3
                    </Button>
                  </Grid>
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

                  {/* Fifth Row */}
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
                          fontSize: '1.4rem',
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
              </Box>
            </Box>
          </Paper>
        </Box>
      </Slide>
    </>
  )
}

export default SlidingCalculatorPanel