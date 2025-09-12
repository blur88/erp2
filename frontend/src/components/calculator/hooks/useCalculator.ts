import { useState, useCallback } from 'react'
import { CalculatorState, CalculatorOperation } from '../types'
import { INITIAL_STATE, MAX_HISTORY_ENTRIES } from '../constants'
import { calculate, formatNumber } from '../utils/calculatorEngine'

export const useCalculator = () => {
  const [state, setState] = useState<CalculatorState>(INITIAL_STATE)

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
    setState(INITIAL_STATE)
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

  const performOperation = useCallback((nextOperation: CalculatorOperation, includeHistory = false) => {
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
            history: includeHistory 
              ? [historyEntry, ...prevState.history.slice(0, MAX_HISTORY_ENTRIES - 1)]
              : prevState.history,
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
  }, [])

  return {
    state,
    actions: {
      inputNumber,
      inputDecimal,
      clear,
      clearEntry,
      backspace,
      performOperation,
    }
  }
}