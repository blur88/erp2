import React from 'react'
import { TextField, TextFieldProps } from '@mui/material'
import { useCurrency } from '@/hooks/useCurrency'

/**
 * Currency input field with dynamic currency symbol from settings
 */
export const CurrencyInput: React.FC<Omit<TextFieldProps, 'InputProps'> & {
  InputProps?: TextFieldProps['InputProps']
}> = (props) => {
  const { currency } = useCurrency()

  return (
    <TextField
      {...props}
      InputProps={{
        ...props.InputProps,
        startAdornment: (
          <span style={{ marginRight: '4px', fontSize: '0.75rem', color: '#666' }}>
            {currency}
          </span>
        ),
      }}
    />
  )
}

export default CurrencyInput
