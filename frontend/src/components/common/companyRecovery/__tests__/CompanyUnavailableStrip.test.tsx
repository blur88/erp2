import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { describe, expect, it, vi } from 'vitest'

import { darkTheme } from '@/styles/theme'
import { CompanyUnavailableStrip } from '../CompanyUnavailableStrip'

const renderStrip = (props: Partial<React.ComponentProps<typeof CompanyUnavailableStrip>> = {}) =>
  render(
    <ThemeProvider theme={darkTheme}>
      <CompanyUnavailableStrip
        collapsed={false}
        canRetry
        retrying={false}
        onRetry={() => undefined}
        {...props}
      />
    </ThemeProvider>,
  )

describe('CompanyUnavailableStrip', () => {
  describe('expanded', () => {
    it('says the company details are unavailable and retries once per click', async () => {
      const onRetry = vi.fn()
      renderStrip({ onRetry })

      expect(screen.getByText('Company details unavailable')).toBeInTheDocument()
      await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
      expect(onRetry).toHaveBeenCalledTimes(1)
      await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
      expect(onRetry).toHaveBeenCalledTimes(2)
    })

    it('disables Retry when the tab may not send', () => {
      renderStrip({ canRetry: false })
      expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled()
    })

    it('still names the action Retry while a request is pending', () => {
      // Pending means the tab may not send again, so the button is disabled.
      renderStrip({ retrying: true, canRetry: false })
      const button = screen.getByRole('button', { name: /^Retry/ })
      expect(button).toBeInTheDocument()
      expect(button).toBeDisabled()
    })
  })

  describe('collapsed', () => {
    it('is one button named for what it does, operable from the keyboard', async () => {
      const onRetry = vi.fn()
      renderStrip({ collapsed: true, onRetry })

      const button = screen.getByRole('button', { name: 'Retry loading company details' })
      expect(screen.queryByText('Company details unavailable')).toBeNull()

      button.focus()
      expect(button).toHaveFocus()
      await userEvent.setup().keyboard('{Enter}')
      expect(onRetry).toHaveBeenCalledTimes(1)
      await userEvent.setup().keyboard(' ')
      expect(onRetry).toHaveBeenCalledTimes(2)
    })

    it('shows the unavailable wording in a tooltip, pending included', async () => {
      renderStrip({ collapsed: true, retrying: true, canRetry: false })
      const button = screen.getByRole('button', { name: 'Retry loading company details' })
      expect(button).toBeDisabled()

      // The disabled button takes no pointer events, so what is hovered is the
      // element the tooltip is anchored to.
      await userEvent.setup().hover(button.parentElement as HTMLElement)
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Company details unavailable')
    })

    it('is reachable by tabbing', async () => {
      renderStrip({ collapsed: true })
      await userEvent.setup().tab()
      expect(screen.getByRole('button', { name: 'Retry loading company details' })).toHaveFocus()
    })
  })
})