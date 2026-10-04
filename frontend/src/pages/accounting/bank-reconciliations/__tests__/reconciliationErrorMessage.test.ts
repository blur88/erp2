import { describe, expect, it } from 'vitest'

import { reconciliationErrorMessage } from '../reconciliationErrorMessage'

describe('reconciliationErrorMessage', () => {
  it('reads text from a detail-bearing conflict', () => {
    const err = { status: 409, data: { text: 'Cannot complete: Difference is 12.50.', gates: { difference: '12.50' } } }
    expect(reconciliationErrorMessage(err, 'fallback')).toBe('Cannot complete: Difference is 12.50.')
  })

  it('reads a plain string message', () => {
    expect(reconciliationErrorMessage({ status: 409, data: 'Only a draft can be edited.' }, 'fallback'))
      .toBe('Only a draft can be edited.')
  })

  it('falls back when the object has no usable text', () => {
    expect(reconciliationErrorMessage({ status: 409, data: { text: '  ' } }, 'fallback')).toBe('fallback')
    expect(reconciliationErrorMessage({ status: 500, data: { gates: {} } }, 'fallback')).toBe('fallback')
    expect(reconciliationErrorMessage(undefined, 'fallback')).toBe('fallback')
  })
})
