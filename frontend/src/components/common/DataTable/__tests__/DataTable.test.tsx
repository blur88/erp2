import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DataTable, type Column } from '../DataTable'

interface Row {
  id: string
  name: string
  amount: number
}

const columns: Column<Row>[] = [
  { header: 'Name', render: (r) => r.name },
  { header: 'Amount', align: 'right', render: (r) => `$${r.amount}` },
]

const rows: Row[] = [{ id: '1', name: 'Alpha', amount: 10 }]

const card = (container: HTMLElement) => container.querySelector('.MuiPaper-outlined')

describe('DataTable', () => {
  it('renders headers and rows', () => {
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} emptyText="Nothing" />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('$10')).toBeInTheDocument()
  })

  it('renders the empty state when there are no rows', () => {
    render(<DataTable columns={columns} rows={[]} getRowKey={(r) => r.id} emptyText="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.queryByText('Name')).not.toBeInTheDocument()
  })

  it('renders a spinner when isLoading', () => {
    render(<DataTable columns={columns} rows={[]} getRowKey={(r) => r.id} emptyText="Nothing" isLoading />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders errorText when isError', () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        getRowKey={(r) => r.id}
        emptyText="Nothing"
        isError
        errorText="Boom"
      />,
    )
    expect(screen.getByText('Boom')).toBeInTheDocument()
  })

  it('wraps a populated table in an outlined Paper card', () => {
    const { container } = render(
      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} emptyText="Nothing" />,
    )
    expect(card(container)).not.toBeNull()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  describe('request states share the populated card frame', () => {
    it.each([
      ['loading', { isLoading: true }, () => screen.getByRole('progressbar')],
      ['error', { isError: true, errorText: 'Boom' }, () => screen.getByText('Boom')],
      ['empty', {}, () => screen.getByText('Nothing here')],
    ] as const)('renders the %s state inside the card', (_label, props, getNode) => {
      const { container } = render(
        <DataTable
          columns={columns}
          rows={[]}
          getRowKey={(r) => r.id}
          emptyText="Nothing here"
          {...props}
        />,
      )
      const paper = card(container)
      expect(paper).not.toBeNull()
      expect(paper).toContainElement(getNode())
    })
  })

  describe('paginationSlot', () => {
    it('renders inside the card when rows are present', () => {
      const { container } = render(
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          emptyText="Nothing"
          paginationSlot={<div>PAGINATION</div>}
        />,
      )
      expect(card(container)).toContainElement(screen.getByText('PAGINATION'))
    })

    it('is hidden when there are no rows', () => {
      render(
        <DataTable
          columns={columns}
          rows={[]}
          getRowKey={(r) => r.id}
          emptyText="Nothing"
          paginationSlot={<div>PAGINATION</div>}
        />,
      )
      expect(screen.queryByText('PAGINATION')).not.toBeInTheDocument()
    })

    it.each([
      ['isLoading', { isLoading: true }],
      ['isError', { isError: true }],
    ] as const)('is hidden when %s even with stale rows', (_label, props) => {
      render(
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          emptyText="Nothing"
          paginationSlot={<div>PAGINATION</div>}
          {...props}
        />,
      )
      expect(screen.queryByText('PAGINATION')).not.toBeInTheDocument()
    })
  })

  describe('footer', () => {
    it('renders outside the card, below the table', () => {
      const { container } = render(
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          emptyText="Nothing"
          footer={<div>FOOTER</div>}
        />,
      )
      const node = screen.getByText('FOOTER')
      expect(node).toBeInTheDocument()
      expect(card(container)).not.toContainElement(node)
    })

    it('is hidden when there are no rows', () => {
      render(
        <DataTable
          columns={columns}
          rows={[]}
          getRowKey={(r) => r.id}
          emptyText="Nothing"
          footer={<div>FOOTER</div>}
        />,
      )
      expect(screen.queryByText('FOOTER')).not.toBeInTheDocument()
    })

    it.each([
      ['isLoading', { isLoading: true }],
      ['isError', { isError: true }],
    ] as const)('is hidden when %s even with stale rows', (_label, props) => {
      render(
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          emptyText="Nothing"
          footer={<div>FOOTER</div>}
          {...props}
        />,
      )
      expect(screen.queryByText('FOOTER')).not.toBeInTheDocument()
    })
  })
})
