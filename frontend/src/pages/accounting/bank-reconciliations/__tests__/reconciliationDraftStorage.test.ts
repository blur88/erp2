// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyForm } from '../reconciliationForm'
import {
  clearDraft,
  draftKey,
  loadDraft,
  newCreateToken,
  saveDraft,
  type StoredDraft,
} from '../reconciliationDraftStorage'

describe('reconciliationDraftStorage', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('scopes keys by user id', () => {
    expect(draftKey('user-1', { reconciliationId: 'recon-1' })).toBe(
      'erp:bank-reconciliation-draft:user-1:recon-1',
    )
    expect(draftKey('user-2', { createToken: 'tok-123' })).toBe(
      'erp:bank-reconciliation-draft:user-2:create:tok-123',
    )
  })

  it('round-trips a draft for an existing reconciliation and for a create token', () => {
    const draft: StoredDraft = {
      v: 1,
      lockVersion: 2,
      form: { ...emptyForm(), closingBalance: '500.00' },
      picker: {
        checklist: { page: 1, search: '' },
        setup: { page: 1, search: '', filter: 'ALL' },
      },
      savedAt: '2026-10-04T00:00:00.000Z',
    }

    const key = draftKey('u1', { reconciliationId: 'r1' })
    saveDraft(key, draft)
    expect(loadDraft(key)).toEqual(draft)

    clearDraft(key)
    expect(loadDraft(key)).toBeNull()

    const createKey = draftKey('u1', { createToken: newCreateToken() })
    saveDraft(createKey, draft)
    expect(loadDraft(createKey)).toEqual(draft)
  })

  it('returns null and does not throw for corrupt JSON', () => {
    const key = draftKey('u1', { reconciliationId: 'r1' })
    sessionStorage.setItem(key, 'not-valid-json{')
    expect(loadDraft(key)).toBeNull()

    sessionStorage.setItem(key, JSON.stringify({ v: 2, form: {} }))
    expect(loadDraft(key)).toBeNull()
  })

  it('does not throw when sessionStorage.setItem throws (quota) or sessionStorage is undefined', () => {
    const key = draftKey('u1', { reconciliationId: 'r1' })
    const draft: StoredDraft = {
      v: 1,
      lockVersion: null,
      form: emptyForm(),
      picker: {
        checklist: { page: 1, search: '' },
        setup: { page: 1, search: '', filter: 'ALL' },
      },
      savedAt: '2026-10-04T00:00:00.000Z',
    }

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => saveDraft(key, draft)).not.toThrow()
    setItemSpy.mockRestore()

    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => loadDraft(key)).not.toThrow()
    expect(loadDraft(key)).toBeNull()
    getItemSpy.mockRestore()

    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => clearDraft(key)).not.toThrow()
    removeItemSpy.mockRestore()
  })
})
