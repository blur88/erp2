import React from 'react'
import { Grid } from '@mui/material'
import { Clear as ClearIcon, Backspace as BackspaceIcon } from '@mui/icons-material'
import { CalculatorButton, ButtonVariant } from './CalculatorButton'
import { useCalculator } from '../hooks/useCalculator'

interface CalculatorGridProps {
  calculatorActions: ReturnType<typeof useCalculator>['actions']
  buttonStyles: Record<ButtonVariant | 'base', any>
  includeHistory?: boolean
}

export const CalculatorGrid: React.FC<CalculatorGridProps> = ({
  calculatorActions,
  buttonStyles,
  includeHistory = false,
}) => {
  return (
    <Grid container spacing={1}>
      {/* Row 1 */}
      <Grid item xs={6}>
        <CalculatorButton
          variant="special"
          buttonStyles={buttonStyles}
          onClick={calculatorActions.clear}
          startIcon={<ClearIcon fontSize="small" />}
        >
          Clear
        </CalculatorButton>
      </Grid>
      <Grid item xs={3}>
        <CalculatorButton
          variant="special"
          buttonStyles={buttonStyles}
          onClick={calculatorActions.clearEntry}
        >
          CE
        </CalculatorButton>
      </Grid>
      <Grid item xs={3}>
        <CalculatorButton
          variant="special"
          buttonStyles={buttonStyles}
          onClick={calculatorActions.backspace}
        >
          <BackspaceIcon fontSize="small" />
        </CalculatorButton>
      </Grid>

      {/* Row 2 */}
      <Grid item xs={3}>
        <CalculatorButton
          variant="number"
          buttonStyles={buttonStyles}
          onClick={() => calculatorActions.inputNumber('7')}
        >
          7
        </CalculatorButton>
      </Grid>
      <Grid item xs={3}>
        <CalculatorButton
          variant="number"
          buttonStyles={buttonStyles}
          onClick={() => calculatorActions.inputNumber('8')}
        >
          8
        </CalculatorButton>
      </Grid>
      <Grid item xs={3}>
        <CalculatorButton
          variant="number"
          buttonStyles={buttonStyles}
          onClick={() => calculatorActions.inputNumber('9')}
        >
          9
        </CalculatorButton>
      </Grid>
      <Grid item xs={3}>
        <CalculatorButton
          variant="operator"
          buttonStyles={buttonStyles}
          onClick={() => calculatorActions.performOperation('/', includeHistory)}
        >
          ÷
        </CalculatorButton>
      </Grid>

      {/* Row 3 */}
      <Grid item xs={3}>
        <CalculatorButton
          variant="number"
          buttonStyles={buttonStyles}
          onClick={() => calculatorActions.inputNumber('4')}
        >
          4
        </CalculatorButton>
      </Grid>
      <Grid item xs={3}>
        <CalculatorButton
          variant="number"
          buttonStyles={buttonStyles}
          onClick={() => calculatorActions.inputNumber('5')}
        >
          5
        </CalculatorButton>
      </Grid>
      <Grid item xs={3}>
        <CalculatorButton
          variant="number"
          buttonStyles={buttonStyles}
          onClick={() => calculatorActions.inputNumber('6')}
        >
          6
        </CalculatorButton>
      </Grid>
      <Grid item xs={3}>
        <CalculatorButton
          variant="operator"
          buttonStyles={buttonStyles}
          onClick={() => calculatorActions.performOperation('*', includeHistory)}
        >
          ×
        </CalculatorButton>
      </Grid>

      {/* Row 4 */}
      <Grid item xs={3}>
        <CalculatorButton
          variant="number"
          buttonStyles={buttonStyles}
          onClick={() => calculatorActions.inputNumber('1')}
        >
          1
        </CalculatorButton>
      </Grid>
      <Grid item xs={3}>
        <CalculatorButton
          variant="number"
          buttonStyles={buttonStyles}
          onClick={() => calculatorActions.inputNumber('2')}
        >
          2
        </CalculatorButton>
      </Grid>
      <Grid item xs={3}>
        <CalculatorButton
          variant="number"
          buttonStyles={buttonStyles}
          onClick={() => calculatorActions.inputNumber('3')}
        >
          3
        </CalculatorButton>
      </Grid>
      <Grid item xs={3}>
        <CalculatorButton
          variant="operator"
          buttonStyles={buttonStyles}
          onClick={() => calculatorActions.performOperation('-', includeHistory)}
        >
          −
        </CalculatorButton>
      </Grid>

      {/* Row 5 */}
      <Grid item xs={6}>
        <CalculatorButton
          variant="number"
          buttonStyles={buttonStyles}
          onClick={() => calculatorActions.inputNumber('0')}
        >
          0
        </CalculatorButton>
      </Grid>
      <Grid item xs={3}>
        <CalculatorButton
          variant="number"
          buttonStyles={buttonStyles}
          onClick={calculatorActions.inputDecimal}
        >
          .
        </CalculatorButton>
      </Grid>
      <Grid item xs={3}>
        <CalculatorButton
          variant="operator"
          buttonStyles={buttonStyles}
          onClick={() => calculatorActions.performOperation('+', includeHistory)}
        >
          +
        </CalculatorButton>
      </Grid>

      {/* Row 6 - Equals */}
      <Grid item xs={12}>
        <CalculatorButton
          variant="equals"
          buttonStyles={buttonStyles}
          onClick={() => calculatorActions.performOperation('=', includeHistory)}
        >
          =
        </CalculatorButton>
      </Grid>
    </Grid>
  )
}