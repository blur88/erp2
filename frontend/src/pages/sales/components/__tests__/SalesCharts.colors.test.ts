import { createTheme } from '@mui/material/styles'
import { describe, expect, it } from 'vitest'

import { statusToHex } from '../SalesCharts'

const theme = createTheme()

describe('statusToHex (SalesCharts)', () => {
  it('maps fulfilled → success.main', () => {
    expect(statusToHex(theme, 'fulfilled')).toBe(theme.palette.success.main)
  })
  it('maps pending → warning.main', () => {
    expect(statusToHex(theme, 'pending')).toBe(theme.palette.warning.main)
  })
  it('maps cancelled → grey[500] (default color → grey)', () => {
    expect(statusToHex(theme, 'cancelled')).toBe(theme.palette.grey[500])
  })
  it('maps unknown → grey[500]', () => {
    expect(statusToHex(theme, 'nope')).toBe(theme.palette.grey[500])
  })
})
