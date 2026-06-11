import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SupplierList from '../SupplierList'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigateMock }
})

beforeEach(() => {
  navigateMock.mockClear()
})

const baseSupplier = {
  id: 'sup-1',
  slug: 'globex',
  companyName: 'Globex',
  contactPerson: 'Hank Scorpio',
  type: 'local',
  isActive: true,
}

function renderList(suppliers = [baseSupplier]) {
  return render(
    <MemoryRouter>
      <SupplierList
        suppliers={suppliers as any}
        loading={false}
        total={suppliers.length}
        onStatusToggle={vi.fn()}
      />
    </MemoryRouter>,
  )
}

describe('SupplierList row click', () => {
  it('navigates to the supplier detail page when a row is clicked', async () => {
    renderList()
    await userEvent.click(screen.getByText('Globex'))
    expect(navigateMock).toHaveBeenCalledWith('/purchasing/suppliers/globex/view')
  })
})
