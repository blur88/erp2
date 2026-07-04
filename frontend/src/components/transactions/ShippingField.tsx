import { useState } from 'react'
import { TextField } from '@mui/material'
import { Controller } from 'react-hook-form'

import { formatNum } from './numberFormat'

const fieldSx = {
  '& .MuiInputBase-input': { fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
}

interface ShippingFieldProps {
  control: any
  currency: string
  theme: any
  isSaving: boolean
}

export default function ShippingField({ control, currency, theme, isSaving }: ShippingFieldProps) {
  const [display, setDisplay] = useState('0.00')
  const [focused, setFocused] = useState(false)

  return (
    <Controller
      name="shipping"
      control={control}
      render={({ field }) => (
        <TextField
          fullWidth
          size="small"
          label="Shipping Fee"
          value={focused ? display : formatNum(field.value ?? 0)}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, '')
            setDisplay(v)
            const num = parseFloat(v.replace(/,/g, ''))
            field.onChange(isNaN(num) ? 0 : num)
          }}
          onFocus={() => {
            setFocused(true)
            setDisplay(String(field.value ?? '0'))
          }}
          onBlur={() => {
            setFocused(false)
            if (!display || display === '.') field.onChange(0)
            setDisplay(formatNum(field.value ?? 0))
          }}
          disabled={isSaving}
          slotProps={{
            input: {
              startAdornment: (
                <span
                  style={{
                    marginRight: 4,
                    fontSize: '0.75rem',
                    color: theme.palette.text.secondary,
                  }}
                >
                  {currency}
                </span>
              ),
            },
            htmlInput: { style: { textAlign: 'right', fontSize: '0.875rem' } },
          }}
          sx={fieldSx}
        />
      )}
    />
  )
}
