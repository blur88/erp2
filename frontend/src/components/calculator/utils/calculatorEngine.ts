import { CalculatorOperation } from '../types'

export const calculate = (
  firstOperand: number, 
  secondOperand: number, 
  operation: CalculatorOperation
): number => {
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
}

export const formatNumber = (num: number): string => {
  const str = num.toString()
  if (str.length > 12) {
    return num.toExponential(6)
  }
  return str
}