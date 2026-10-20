import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ConfirmationDialog from '../ConfirmationDialog'

describe('ConfirmationDialog with a required reason', () => {
  it('requires a trimmed 3–500 character reason and submits the trimmed value', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()

    render(
      <ConfirmationDialog
        open
        title="Unfulfill SO-26-001?"
        message="Stock and cost are restored."
        confirmText="Unfulfill"
        requireReason
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    const confirm = screen.getByRole('button', { name: 'Unfulfill' })
    const reason = screen.getByRole('textbox', { name: 'Reason' })
    expect(confirm).toBeDisabled()

    await user.type(reason, 'ab')
    expect(confirm).toBeDisabled()
    await user.clear(reason)
    await user.type(reason, '  Correction  ')
    expect(confirm).toBeEnabled()
    expect(reason).toHaveAttribute('maxLength', '500')

    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledWith('Correction')
  })
})
