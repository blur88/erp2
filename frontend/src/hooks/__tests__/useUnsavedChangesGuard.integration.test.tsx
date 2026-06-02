import React from 'react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'

import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard'

function ProgrammaticForm() {
  const navigate = useNavigate()
  const {
    setValue,
    formState: { isDirty, isSubmitting },
  } = useForm<{ name: string }>({
    defaultValues: { name: '' },
  })
  const { UnsavedChangesDialog } = useUnsavedChangesGuard(isDirty, isSubmitting)

  return (
    <div>
      <span data-testid="dirty">{String(isDirty)}</span>
      <button onClick={() => setValue('name', 'picked', { shouldDirty: true })}>Pick</button>
      <button onClick={() => navigate('/other')}>Go</button>
      {UnsavedChangesDialog}
    </div>
  )
}

function makeRouter() {
  return createMemoryRouter(
    [
      { path: '/', element: <ProgrammaticForm /> },
      { path: '/other', element: <div>OTHER PAGE</div> },
    ],
    { initialEntries: ['/'] },
  )
}

describe('useUnsavedChangesGuard integration', () => {
  it('blocks navigation after programmatic shouldDirty setValue', async () => {
    const user = userEvent.setup()
    render(<RouterProvider router={makeRouter()} />)

    await user.click(screen.getByText('Pick'))
    expect(screen.getByTestId('dirty').textContent).toBe('true')

    await user.click(screen.getByText('Go'))

    expect(screen.getByText(/discard changes/i)).toBeInTheDocument()
    expect(screen.queryByText('OTHER PAGE')).not.toBeInTheDocument()
  })

  it('proceeds to destination when Discard is clicked', async () => {
    const user = userEvent.setup()
    render(<RouterProvider router={makeRouter()} />)

    await user.click(screen.getByText('Pick'))
    await user.click(screen.getByText('Go'))
    await user.click(screen.getByRole('button', { name: /discard/i }))

    expect(await screen.findByText('OTHER PAGE')).toBeInTheDocument()
  })

  it('stays on page when Keep editing is clicked', async () => {
    const user = userEvent.setup()
    render(<RouterProvider router={makeRouter()} />)

    await user.click(screen.getByText('Pick'))
    await user.click(screen.getByText('Go'))
    await user.click(screen.getByRole('button', { name: /keep editing/i }))

    expect(screen.queryByText('OTHER PAGE')).not.toBeInTheDocument()
    expect(screen.getByTestId('dirty').textContent).toBe('true')
  })
})
