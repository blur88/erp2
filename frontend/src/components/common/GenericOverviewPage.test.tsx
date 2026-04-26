import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import GenericOverviewPage from './GenericOverviewPage'

describe('GenericOverviewPage', () => {
  it('renders children inside an independently scrollable flex container', () => {
    render(
      <GenericOverviewPage>
        <div>Overview content</div>
      </GenericOverviewPage>
    )

    const container = screen.getByText('Overview content').parentElement

    expect(container).toHaveStyle({
      display: 'flex',
      flexDirection: 'column',
      flex: '1',
      minHeight: '0',
      overflow: 'auto',
    })
  })
})
