import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import NotificationPanel from './NotificationPanel'
import * as clipboardUtils from '@/utils/clipboard'

const dispatchMock = vi.fn()
let writeTextMock: ReturnType<typeof vi.fn>

vi.mock('@/hooks/useRedux', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: () => [],
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotifications: () => ({
    notifications: [
      {
        id: 'notif-1',
        type: 'success' as const,
        title: 'Order Shipped',
        message: 'Delivery expected 2026-02-27',
        timestamp: new Date(),
        read: false,
      },
    ],
    removeNotification: vi.fn(),
  }),
}))

vi.mock('@/store/slices/notificationSlice', () => ({
  markAsRead: (id: string) => ({ type: 'notification/markAsRead', payload: id }),
  markAllAsRead: () => ({ type: 'notification/markAllAsRead' }),
  removeNotification: (id: string) => ({ type: 'notification/removeNotification', payload: id }),
}))

describe('NotificationPanel copy button', () => {
  beforeEach(() => {
    dispatchMock.mockClear()
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    Object.defineProperty(window.navigator, 'clipboard', {
      value: clipboard,
      configurable: true,
    })
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: clipboard,
      configurable: true,
    })
    writeTextMock = clipboard.writeText
  })

  it('copies notification message to clipboard and shows check icon', async () => {
    const anchorEl = document.createElement('button')
    anchorEl.textContent = 'anchor'
    anchorEl.style.position = 'absolute'
    anchorEl.style.top = '12px'
    anchorEl.style.left = '12px'
    anchorEl.style.width = '40px'
    anchorEl.style.height = '20px'
    anchorEl.getBoundingClientRect = vi.fn(() => ({
      x: 12,
      y: 12,
      top: 12,
      left: 12,
      right: 52,
      bottom: 32,
      width: 40,
      height: 20,
      toJSON: () => ({}),
    } as DOMRect))
    document.body.appendChild(anchorEl)

    render(
      <NotificationPanel anchorEl={anchorEl} open={true} onClose={vi.fn()} />,
    )

    const copyButton = screen.getByTestId('ContentCopyIcon').closest('button')
    expect(copyButton).not.toBeNull()
    fireEvent.click(copyButton as HTMLButtonElement)

    expect(writeTextMock).toHaveBeenCalledWith('Delivery expected 2026-02-27')
    expect(await screen.findByTestId('CheckIcon')).toBeInTheDocument()

    document.body.removeChild(anchorEl)
  })

  it('passes the Popover Paper element as container to copyToClipboard', async () => {
    const copyToClipboardSpy = vi.spyOn(clipboardUtils, 'copyToClipboard').mockResolvedValue(true)

    const anchorEl = document.createElement('button')
    anchorEl.getBoundingClientRect = vi.fn(() => ({
      x: 12, y: 12, top: 12, left: 12, right: 52, bottom: 32, width: 40, height: 20,
      toJSON: () => ({}),
    } as DOMRect))
    document.body.appendChild(anchorEl)

    render(<NotificationPanel anchorEl={anchorEl} open={true} onClose={vi.fn()} />)

    const copyButton = screen.getByTestId('ContentCopyIcon').closest('button')
    fireEvent.click(copyButton as HTMLButtonElement)

    expect(copyToClipboardSpy).toHaveBeenCalledOnce()
    const container = copyToClipboardSpy.mock.calls[0][1]
    const popoverPaper = document.querySelector('.MuiPopover-paper')
    expect(popoverPaper).not.toBeNull()
    expect(container).toBe(popoverPaper)

    document.body.removeChild(anchorEl)
    copyToClipboardSpy.mockRestore()
  })
})
