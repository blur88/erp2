import { render, screen } from '@testing-library/react'
import DiffViewer from './DiffViewer'

describe('DiffViewer column sizing', () => {
  test('uses consistent fixed-width columns in create mode', () => {
    const { container } = render(
      <DiffViewer
        newValues={{
          name: 'Very long value that would otherwise force different column widths',
          status: 'ACTIVE',
        }}
      />
    )

    const cols = container.querySelectorAll('col')
    expect(cols).toHaveLength(2)
    expect(cols[0]).toHaveAttribute('style', expect.stringContaining('35%'))
    expect(cols[1]).toHaveAttribute('style', expect.stringContaining('65%'))

    expect(screen.getByText('Field')).toBeInTheDocument()
    expect(screen.getByText('Value')).toBeInTheDocument()
  })

  test('uses consistent fixed-width columns in update mode', () => {
    const { container } = render(
      <DiffViewer
        oldValues={{ name: 'Short' }}
        newValues={{ name: 'A much longer updated value to challenge auto layout sizing' }}
      />
    )

    const cols = container.querySelectorAll('col')
    expect(cols).toHaveLength(3)
    expect(cols[0]).toHaveAttribute('style', expect.stringContaining('35%'))
    expect(cols[1]).toHaveAttribute('style', expect.stringContaining('32.5%'))
    expect(cols[2]).toHaveAttribute('style', expect.stringContaining('32.5%'))

    expect(screen.getByText('Old Value')).toBeInTheDocument()
    expect(screen.getByText('New Value')).toBeInTheDocument()
  })
})
