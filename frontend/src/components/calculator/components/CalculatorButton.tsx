import React, { ReactNode } from 'react'
import { Button, ButtonProps } from '@mui/material'

export type ButtonVariant = 'number' | 'operator' | 'special' | 'equals'

interface CalculatorButtonProps extends Omit<ButtonProps, 'variant'> {
  variant: ButtonVariant
  buttonStyles: Record<ButtonVariant | 'base', any>
  children: ReactNode
}

export const CalculatorButton: React.FC<CalculatorButtonProps> = ({
  variant,
  buttonStyles,
  children,
  sx,
  ...props
}) => {
  return (
    <Button
      fullWidth
      sx={{
        ...buttonStyles[variant],
        ...sx,
      }}
      {...props}
    >
      {children}
    </Button>
  )
}