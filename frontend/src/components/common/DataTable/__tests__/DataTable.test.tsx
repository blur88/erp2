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

  it('renders a footer below the table', () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        emptyText="Nothing"
        footer={<div>FOOTER</div>}
      />,
    )
    expect(screen.getByText('FOOTER')).toBeInTheDocument()
  })
})
