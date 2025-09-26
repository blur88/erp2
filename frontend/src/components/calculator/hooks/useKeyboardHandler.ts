import { useEffect, useCallback } from 'react'
import { useCalculator } from './useCalculator'

interface UseKeyboardHandlerProps {
  isEnabled: boolean
  calculatorActions: ReturnType<typeof useCalculator>['actions']
}

export const useKeyboardHandler = ({ 
  isEnabled, 
  calculatorActions 
}: UseKeyboardHandlerProps) => {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isEnabled) return

    event.preventDefault()
    
    const { key } = event
    
    if (key >= '0' && key <= '9') {
      calculatorActions.inputNumber(key)
    } else if (key === '.') {
      calculatorActions.inputDecimal()
    } else if (key === '+') {
      calculatorActions.performOperation('+', true)
    } else if (key === '-') {
      calculatorActions.performOperation('-', true)
    } else if (key === '*') {
      calculatorActions.performOperation('*', true)
    } else if (key === '/') {
      calculatorActions.performOperation('/', true)
    } else if (key === 'Enter' || key === '=') {
      calculatorActions.performOperation('=', true)
    } else if (key === 'Escape') {
      calculatorActions.clear()
    } else if (key === 'Backspace') {
      calculatorActions.backspace()
    } else if (key === 'Delete') {
      calculatorActions.clearEntry()
    }
  }, [isEnabled, calculatorActions])

  useEffect(() => {
    if (isEnabled) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isEnabled, handleKeyDown])
}