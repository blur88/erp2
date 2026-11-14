import { render, screen } from '@testing-library/react'
import { Typography } from '@mui/material'
import { ThemeProvider } from '@mui/material/styles'
import { expect, it } from 'vitest'
import { darkTheme } from '@/styles/theme'

it('renders bodySmall with the established small body size, weight and line height', () => {
  render(
    <ThemeProvider theme={darkTheme}>
      <Typography variant="bodySmall">Small body text</Typography>
    </ThemeProvider>,
  )

  const style = getComputedStyle(screen.getByText('Small body text'))
  expect(style.fontSize).toBe('12.8px')
  expect(style.fontWeight).toBe('400')
  expect(style.lineHeight).toBe('1.5')
})
