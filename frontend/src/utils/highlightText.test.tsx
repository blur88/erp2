import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { highlightText } from './highlightText'

function renderHighlight(text: string, query: string) {
  render(<>{highlightText(text, query)}</>)
}

describe('highlightText', () => {
  it('returns the original string when query is empty', () => {
    const result = highlightText('Hello World', '')

    expect(result).toBe('Hello World')
  })

  it('returns the original string when query is whitespace only', () => {
    const result = highlightText('Hello World', '   ')

    expect(result).toBe('Hello World')
  })

  it('returns the original string when there is no match', () => {
    const result = highlightText('Hello World', 'xyz')

    expect(result).toBe('Hello World')
  })

  it('highlights first occurrence, case-insensitive', () => {
    renderHighlight('ABC Trading Sdn Bhd', 'abc')

    const bold = screen.getByText('ABC')
    expect(bold.tagName).toBe('SPAN')
  })

  it('matches regardless of case', () => {
    renderHighlight('hello world', 'HELLO')

    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('only highlights first occurrence', () => {
    renderHighlight('abc and abc', 'abc')

    const spans = document.querySelectorAll('span')
    expect(spans).toHaveLength(1)
  })

  it('handles regex special characters safely with dots', () => {
    expect(() => renderHighlight('file.txt', '.')).not.toThrow()
  })

  it('handles regex special characters safely with brackets', () => {
    expect(() => renderHighlight('Item [A]', '[A]')).not.toThrow()
  })

  it('trims query before matching', () => {
    renderHighlight('ABC Trading', '  ABC  ')

    expect(screen.getByText('ABC')).toBeInTheDocument()
  })

  it('returns string on no-match so callers can treat it as ReactNode', () => {
    const result = highlightText('Hello', 'zzz')

    expect(typeof result).toBe('string')
  })

  it('applies custom fontWeight when highlightWeight is provided', () => {
    const { container } = render(<>{highlightText('abc and more', 'abc', 600)}</>)
    const span = container.querySelector('span')

    expect(span?.style.fontWeight).toBe('600')
  })

  it('applies highlightColor when provided', () => {
    const { container } = render(<>{highlightText('abc and more', 'abc', 700, '#ff0000')}</>)
    const span = container.querySelector('span')

    expect(span?.style.color).toBe('rgb(255, 0, 0)')
  })

  it('does not set color when highlightColor is not provided', () => {
    const { container } = render(<>{highlightText('abc and more', 'abc')}</>)
    const span = container.querySelector('span')

    expect(span?.style.color).toBe('')
  })

  it('applies both weight and color when both are provided', () => {
    const { container } = render(<>{highlightText('abc and more', 'abc', 600, '#0000ff')}</>)
    const span = container.querySelector('span')

    expect(span?.style.fontWeight).toBe('600')
    expect(span?.style.color).toBe('rgb(0, 0, 255)')
  })
})
