import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { Menu, MenuItem, Select } from '@mui/material'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { darkTheme } from '@/styles/theme'

const FIELD_FONT = '0.875rem'
const LISTBOX_SELECTOR = ':where(.MuiMenu-list[role="listbox"]) &'

const components = () => darkTheme.components as Record<string, any>

const renderThemed = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={darkTheme}>{ui}</ThemeProvider>)

// Layer 1 — the theme object. These are the real red/green tests: they fail if
// a rule is deleted, renamed, or given a wrong selector.
describe('form-control typography theme rules', () => {
  it('sets the field text size on MuiInputBase', () => {
    expect(components().MuiInputBase.styleOverrides.input.fontSize).toBe(FIELD_FONT)
  })

  it('sets the label size WITHOUT dropping the existing sizeXs transform', () => {
    const root = components().MuiInputLabel.styleOverrides.root
    expect(root.fontSize).toBe(FIELD_FONT)
    // Load-bearing: fontSize is MERGED into an existing entry. The plausible
    // mistake is adding a second MuiInputLabel key, silently losing this.
    expect(
      root['&.MuiInputLabel-outlined.MuiInputLabel-sizeXs:not(.MuiInputLabel-shrink)'].transform,
    ).toBe('translate(14px, 5px) scale(1)')
  })

  it('scopes the option rule to the listbox selector exactly', () => {
    const root = components().MuiMenuItem.styleOverrides.root
    expect(Object.keys(root)).toContain(LISTBOX_SELECTOR)
    expect(root[LISTBOX_SELECTOR].fontSize).toBe(FIELD_FONT)
    // Must NOT set a bare fontSize, which would hit action menus too.
    expect(root.fontSize).toBeUndefined()
  })

  it('covers MUI X pickers, which .MuiInputBase-input never matched', () => {
    expect(components().MuiPickersInputBase.styleOverrides.root.fontSize).toBe(FIELD_FONT)
  })
})

// Layer 2 — DOM structure. The selector above is only correct while these roles
// hold; if they change, the rule silently stops matching.
describe('select/action-menu structural boundary', () => {
  it('gives a Select menu list role="listbox"', async () => {
    const user = userEvent.setup()
    renderThemed(
      <Select value="a" onChange={() => {}}>
        <MenuItem value="a">Alpha</MenuItem>
      </Select>,
    )
    await user.click(screen.getByRole('combobox'))
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
  })

  it('keeps role="listbox" when a caller passes its own paper-only MenuProps', async () => {
    const user = userEvent.setup()
    renderThemed(
      <Select
        value="a"
        onChange={() => {}}
        MenuProps={{ slotProps: { paper: { style: { maxHeight: 300 } } } }}
      >
        <MenuItem value="a">Alpha</MenuItem>
      </Select>,
    )
    await user.click(screen.getByRole('combobox'))
    // This is the CategorySelector shape. MUI rebuilds slotProps.list after
    // spreading ...MenuProps, so paper-only callers cannot remove the role.
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
  })

  it('gives a standalone action menu role="menu", not listbox', () => {
    renderThemed(
      <Menu open anchorEl={document.body}>
        <MenuItem>Log out</MenuItem>
      </Menu>,
    )
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument()
  })
})