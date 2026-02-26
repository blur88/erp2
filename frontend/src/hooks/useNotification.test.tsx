import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationProvider, useNotification } from './useNotification'

const dispatchMock = vi.fn()
const addNotificationMock = vi.fn((payload: any) => ({ type: 'notification/add', payload }))

vi.mock('./useRedux', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: () => [],
}))

vi.mock('@/store/slices/notificationSlice', () => ({
  addNotification: (payload: any) => addNotificationMock(payload),
  removeNotification: vi.fn(),
  selectNotifications: vi.fn(),
}))

const Consumer = () => {
  const { showNotification } = useNotification()
  return (
    <button onClick={() => showNotification('Saved item', 'success', 'Success', 0)}>
      notify
    </button>
  )
}

describe('NotificationProvider copy action', () => {
  beforeEach(() => {
    dispatchMock.mockClear()
    addNotificationMock.mockClear()

    Object.defineProperty(window.navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    })
  })

  it('shows copied check icon after pressing copy action', async () => {
    const user = userEvent.setup()

    render(
      <NotificationProvider>
        <Consumer />
      </NotificationProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'notify' }))

    await screen.findByRole('alert')
    const copyIcon = screen.getByTestId('ContentCopyIcon')
    const copyButton = copyIcon.closest('button')
    if (!copyButton) {
      throw new Error('Copy button not found')
    }
    await user.click(copyButton)

    expect(screen.getByTestId('CheckIcon')).toBeInTheDocument()
  })
})
