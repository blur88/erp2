export type CalculatorOperation = '+' | '-' | '*' | '/' | '='

export interface CalculatorState {
  display: string
  previousValue: number | null
  operation: CalculatorOperation | null
  waitingForOperand: boolean
  history: string[]
}