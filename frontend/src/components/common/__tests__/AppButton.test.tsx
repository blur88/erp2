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
  it('renders primary as contained colorPrimary', () => {
    wrap(<AppButton variant="primary">Save</AppButton>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn.className).toMatch(/MuiButton-contained/)
    expect(btn.className).toMatch(/MuiButton-colorPrimary/)
  })

  it('renders secondary as contained colorSecondary', () => {
    wrap(<AppButton variant="secondary">Cancel</AppButton>)
    const btn = screen.getByRole('button', { name: 'Cancel' })
    expect(btn.className).toMatch(/MuiButton-contained/)
    expect(btn.className).toMatch(/MuiButton-colorSecondary/)
  })

  it('renders outlined as outlined colorPrimary', () => {
    wrap(<AppButton variant="outlined">View</AppButton>)
    const btn = screen.getByRole('button', { name: 'View' })
    expect(btn.className).toMatch(/MuiButton-outlined/)
    expect(btn.className).toMatch(/MuiButton-colorPrimary/)
  })

  it('renders neutral as outlined colorInherit', () => {
    wrap(<AppButton variant="neutral">Custom</AppButton>)
    const btn = screen.getByRole('button', { name: 'Custom' })
    expect(btn.className).toMatch(/MuiButton-outlined/)
    expect(btn.className).toMatch(/MuiButton-colorInherit/)
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

  it('renders info as contained colorInfo', () => {
    wrap(<AppButton variant="info">Info</AppButton>)
    const btn = screen.getByRole('button', { name: 'Info' })
    expect(btn.className).toMatch(/MuiButton-contained/)
    expect(btn.className).toMatch(/MuiButton-colorInfo/)
  })

  it('renders text as text colorInherit', () => {
    wrap(<AppButton variant="text">Link</AppButton>)
    const btn = screen.getByRole('button', { name: 'Link' })
    expect(btn.className).toMatch(/MuiButton-text/)
    expect(btn.className).toMatch(/MuiButton-colorInherit/)
  })

  it('renders with no variant as outlined colorPrimary (default)', () => {
    wrap(<AppButton>Default</AppButton>)
    const btn = screen.getByRole('button', { name: 'Default' })
    expect(btn.className).toMatch(/MuiButton-outlined/)
    expect(btn.className).toMatch(/MuiButton-colorPrimary/)
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

  it('renders as contained colorPrimary when sort is active', () => {
    wrap(<AppButton sortConfig={baseSortConfig}>Sort</AppButton>)
    const btn = screen.getByRole('button', { name: /sort/i })
    expect(btn.className).toMatch(/MuiButton-contained/)
    expect(btn.className).toMatch(/MuiButton-colorPrimary/)
  })

  it('renders as outlined colorPrimary when sort is inactive', () => {
    wrap(<AppButton sortConfig={{ ...baseSortConfig, sortBy: 'other' }}>Sort</AppButton>)
    const btn = screen.getByRole('button', { name: /sort/i })
    expect(btn.className).toMatch(/MuiButton-outlined/)
    expect(btn.className).toMatch(/MuiButton-colorPrimary/)
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    wrap(<AppButton sortConfig={baseSortConfig} onClick={onClick}>Sort</AppButton>)
    screen.getByRole('button', { name: /sort/i }).click()
    expect(onClick).toHaveBeenCalledOnce()
  })
})
