import { describe, expect, it } from 'vitest'

import { getProviderSettlementActionMetas } from '../providerSettlementActions'

describe('provider settlement row actions', () => {
  it('offers edit, discard and post on a draft', () => {
    const keys = getProviderSettlementActionMetas('DRAFT').map((a) => a.key)
    expect(keys).toEqual(['view', 'edit', 'post', 'discard'])
  })

  it('offers only view and reverse once posted', () => {
    const keys = getProviderSettlementActionMetas('POSTED').map((a) => a.key)
    expect(keys).toEqual(['view', 'reverse'])
  })

  it('offers only view once reversed', () => {
    expect(getProviderSettlementActionMetas('REVERSED').map((a) => a.key)).toEqual(['view'])
  })
})
