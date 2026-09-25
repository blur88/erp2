import { describe, expect, it } from 'vitest'

import {
  getProviderSettlementActionMetas,
  isNotProviderClearingDraft,
} from '../providerSettlementActions'

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

  // #1285: the Post signal is a pure function of the stored status + flag.
  // `undefined` means "unknown" (an older payload) and never blocks.
  it.each([
    ['DRAFT', false, true], ['DRAFT', true, false], ['DRAFT', undefined, false],
    ['POSTED', false, false], ['REVERSED', false, false],
  ] as const)('%s with flag %s ⇒ blocked %s', (status, flag, expected) => {
    expect(isNotProviderClearingDraft({
      status,
      clearingAccount: { id: 'a', code: '1200', name: 'CIMB', isProviderClearing: flag },
    } as any)).toBe(expected)
  })
})
