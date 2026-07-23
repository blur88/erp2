import { describe, expect, it } from 'vitest'

import { purchasingFilterConfig } from '@/pages/purchasing/PurchasingPage'
import { parseFilters } from '@/utils/filterBar.url'

describe('PurchasingPage status filter', () => {
  it('offers the lowercase values its backend understands', () => {
    const field: any = purchasingFilterConfig.fields.find((f: any) => f.field === 'status')
    expect(field.type).toBe('select')
    expect(field.options.map((o: any) => o.value)).toEqual(['received', 'pending'])
  })

  it('accepts a bookmarked lowercase URL', () => {
    const parsed: any = parseFilters(
      new URLSearchParams('purchasing_status=received'),
      purchasingFilterConfig as any,
    )
    expect(parsed.status).toBe('received')
  })

  it('rejects the uppercase PO values, which this endpoint ignores', () => {
    const parsed: any = parseFilters(
      new URLSearchParams('purchasing_status=DRAFT'),
      purchasingFilterConfig as any,
    )
    expect(parsed.status).toBeNull()
  })
})
