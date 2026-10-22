import { render, screen } from '@testing-library/react'
import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material'
import { describe, expect, it } from 'vitest'

import { TableCard } from './TableCard'

const sampleTable = (
  <Table>
    <TableHead>
      <TableRow>
        <TableCell>Header</TableCell>
      </TableRow>
    </TableHead>
    <TableBody>
      <TableRow>
        <TableCell>Cell</TableCell>
      </TableRow>
    </TableBody>
  </Table>
)

describe('TableCard', () => {
  // These assert composition only; they do not check the header band's sx
  // styles. jsdom exposes themed sx values, but cannot verify layout such as
  // clipping, scrolling, sticky positioning or alignment (see
  // docs/frontend/testing-and-print.md, "What jsdom can observe").
  it('renders its children', () => {
    render(<TableCard>{sampleTable}</TableCard>)
    expect(screen.getByText('Header')).toBeInTheDocument()
    expect(screen.getByText('Cell')).toBeInTheDocument()
  })

  it('renders the table inside an outlined Paper card', () => {
    const { container } = render(<TableCard>{sampleTable}</TableCard>)
    const card = container.querySelector('.MuiPaper-outlined')
    expect(card).toBeInTheDocument()
    expect(card).toHaveClass('MuiTableContainer-root')
    expect(card?.querySelector('table')).toBeInTheDocument()
  })

  it('merges caller sx without dropping the card styling', () => {
    const { container } = render(<TableCard sx={{ mb: 3 }}>{sampleTable}</TableCard>)
    expect(container.querySelector('.MuiPaper-outlined')).toBeInTheDocument()
  })
})
