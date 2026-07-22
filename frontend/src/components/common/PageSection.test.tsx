import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import PageSection from './PageSection'

describe('PageSection', () => {
  it('renders the label', () => {
    render(<PageSection label="Customer list"><div>content</div></PageSection>)
    expect(screen.getByText('Customer list')).toBeInTheDocument()
  })

  it('renders children', () => {
    render(<PageSection label="Test"><div data-testid="child">content</div></PageSection>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders optional meta on the right side', () => {
    render(
      <PageSection label="Customer list" meta={<span>25 per page</span>}>
        <div>content</div>
      </PageSection>,
    )
    expect(screen.getByText('25 per page')).toBeInTheDocument()
  })

  it('does not render meta area when meta is not provided', () => {
    const { container } = render(
      <PageSection label="Customer list"><div>content</div></PageSection>,
    )
    expect(container.querySelector('[data-testid="page-section-meta"]')).not.toBeInTheDocument()
  })

  it('does not stretch or scroll by default so cards can stack', () => {
    const { container } = render(
      <PageSection label="Payment"><div data-testid="child">content</div></PageSection>,
    )
    const paper = container.querySelector('.MuiPaper-root') as HTMLElement
    const body = screen.getByTestId('child').parentElement as HTMLElement

    expect(getComputedStyle(paper).flexGrow).not.toBe('1')
    expect(getComputedStyle(body).overflow).not.toBe('auto')
  })

  it('stretches and scrolls when fill is set', () => {
    const { container } = render(
      <PageSection label="Payment" fill><div data-testid="child">content</div></PageSection>,
    )
    const paper = container.querySelector('.MuiPaper-root') as HTMLElement
    const body = screen.getByTestId('child').parentElement as HTMLElement

    expect(getComputedStyle(paper).flexGrow).toBe('1')
    expect(getComputedStyle(body).overflow).toBe('auto')
  })
})
