import { CalculatorState } from './types'

export const INITIAL_STATE: CalculatorState = {
  display: '0',
  previousValue: null,
  operation: null,
  waitingForOperand: false,
  history: [],
}

export const MAX_DISPLAY_LENGTH = 12
export const MAX_HISTORY_ENTRIES = 10