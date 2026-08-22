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
  // jsdom has no layout engine and Emotion styles never reach getComputedStyle
  // (see CLAUDE.md), so these assert composition only. Corner clipping, the
  // header band, and maxHeight scrolling are verified in a browser.
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
