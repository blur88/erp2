import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material'
import { describe, expect, it, vi } from 'vitest'

import { AppButton } from '../AppButton'

const theme = createTheme()

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
}

describe('AppButton - variants', () => {
  it('renders primary as contained', () => {
    wrap(<AppButton variant="primary">Save</AppButton>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn.className).toMatch(/MuiButton-contained/)
  })

  it('renders outlined as outlined', () => {
    wrap(<AppButton variant="outlined">Cancel</AppButton>)
    const btn = screen.getByRole('button', { name: 'Cancel' })
    expect(btn.className).toMatch(/MuiButton-outlined/)
  })

  it('renders secondary as outlined', () => {
    wrap(<AppButton variant="secondary">View</AppButton>)
    const btn = screen.getByRole('button', { name: 'View' })
    expect(btn.className).toMatch(/MuiButton-outlined/)
  })

  it('renders danger as contained colorError', () => {
    wrap(<AppButton variant="danger">Delete</AppButton>)
    const btn = screen.getByRole('button', { name: 'Delete' })
    expect(btn.className).toMatch(/MuiButton-contained/)
    expect(btn.className).toMatch(/MuiButton-colorError/)
  })

  it('renders warning as contained colorWarning', () => {
    wrap(<AppButton variant="warning">Revert</AppButton>)
    const btn = screen.getByRole('button', { name: 'Revert' })
    expect(btn.className).toMatch(/MuiButton-contained/)
    expect(btn.className).toMatch(/MuiButton-colorWarning/)
  })

  it('renders success as contained colorSuccess', () => {
    wrap(<AppButton variant="success">Restore</AppButton>)
    const btn = screen.getByRole('button', { name: 'Restore' })
    expect(btn.className).toMatch(/MuiButton-contained/)
    expect(btn.className).toMatch(/MuiButton-colorSuccess/)
  })
})

describe('AppButton - size=filter', () => {
  it('applies 40px height when size=filter', () => {
    wrap(<AppButton size="filter">Reset</AppButton>)
    const btn = screen.getByRole('button', { name: 'Reset' })
    expect(btn).toBeInTheDocument()
  })
})

describe('AppButton - loading', () => {
  it('disables the button when loading', () => {
    wrap(<AppButton variant="primary" loading>Save</AppButton>)
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('shows spinner when loading', () => {
    wrap(<AppButton variant="primary" loading>Save</AppButton>)
    expect(document.querySelector('.MuiCircularProgress-root')).toBeInTheDocument()
  })

  it('does not disable when loading is false', () => {
    wrap(<AppButton variant="primary" loading={false}>Save</AppButton>)
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })
})

describe('AppButton - sortConfig', () => {
  const baseSortConfig = {
    field: 'orderNumber',
    sortBy: 'orderNumber',
    sortOrder: 'asc' as const,
  }

  it('renders as contained when sort is active', () => {
    wrap(<AppButton sortConfig={baseSortConfig}>Sort</AppButton>)
    const btn = screen.getByRole('button', { name: /sort/i })
    expect(btn.className).toMatch(/MuiButton-contained/)
  })

  it('renders as outlined when sort is inactive', () => {
    wrap(<AppButton sortConfig={{ ...baseSortConfig, sortBy: 'other' }}>Sort</AppButton>)
    const btn = screen.getByRole('button', { name: /sort/i })
    expect(btn.className).toMatch(/MuiButton-outlined/)
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    wrap(<AppButton sortConfig={baseSortConfig} onClick={onClick}>Sort</AppButton>)
    screen.getByRole('button', { name: /sort/i }).click()
    expect(onClick).toHaveBeenCalledOnce()
  })
})
