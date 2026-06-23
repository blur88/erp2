import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import CategorySelector from '../CategorySelector'
import { ApiService } from '@/services/api'

vi.mock('@/services/api', () => ({
  ApiService: {
    get: vi.fn(),
  },
}))

const enabledA = {
  id: 'cat-enabled-a',
  name: 'Enabled Category A',
  slug: 'enabled-a',
  isEnabled: true,
  level: 0,
  fullPath: '/enabled-a',
  isRoot: false,
  hasChildren: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const disabledCurrent = {
  id: 'cat-disabled-current',
  name: 'Disabled Current',
  slug: 'disabled-current',
  isEnabled: false,
  level: 0,
  fullPath: '/disabled-current',
  isRoot: false,
  hasChildren: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const disabledOther = {
  id: 'cat-disabled-other',
  name: 'Disabled Other',
  slug: 'disabled-other',
  isEnabled: false,
  level: 0,
  fullPath: '/disabled-other',
  isRoot: false,
  hasChildren: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('CategorySelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the current disabled category as value but hides other disabled ones from options', async () => {
    const user = userEvent.setup()

    const mockGet = ApiService.get as ReturnType<typeof vi.fn>
    mockGet.mockResolvedValue([enabledA, disabledCurrent, disabledOther])

    render(
      <CategorySelector
        value={disabledCurrent}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('Disabled Current')).toBeInTheDocument()

    const selectInput = screen.getByRole('combobox')
    await user.click(selectInput)

    expect(screen.getByText('Enabled Category A')).toBeInTheDocument()

    expect(screen.queryByText('Disabled Other')).not.toBeInTheDocument()

    const currentTexts = screen.getAllByText('Disabled Current')
    expect(currentTexts.length).toBeGreaterThanOrEqual(1)
  })
})
