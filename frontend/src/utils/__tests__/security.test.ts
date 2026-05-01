// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { escapeHtml } from '../security'

describe('escapeHtml', () => {
  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('escapes ampersands', () => {
    expect(escapeHtml('fish & chips')).toBe('fish &amp; chips')
  })

  it('escapes double quotes', () => {
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;')
  })

  it('escapes single quotes', () => {
    expect(escapeHtml("O'Brien")).toBe('O&#039;Brien')
  })

  it('handles numbers', () => {
    expect(escapeHtml(42)).toBe('42')
  })

  it('handles null', () => {
    expect(escapeHtml(null)).toBe('')
  })

  it('handles undefined', () => {
    expect(escapeHtml(undefined)).toBe('')
  })

  it('handles boolean', () => {
    expect(escapeHtml(true)).toBe('true')
  })

  it('leaves safe strings unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World')
  })

  it('escapes a full XSS payload', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
    )
  })
})
