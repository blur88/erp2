import { describe, expect, it } from 'vitest'

import { CustomerType } from '@/types'

import { formatCustomerType } from './customerUtils'

describe('formatCustomerType', () => {
  it('formats individual as Individual', () => {
    expect(formatCustomerType(CustomerType.INDIVIDUAL)).toBe('Individual')
  })

  it('formats business as Business', () => {
    expect(formatCustomerType(CustomerType.BUSINESS)).toBe('Business')
  })
})
