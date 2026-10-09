// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllDrafts, draftKey } from '../reconciliationDraftStorage'
import { useClearReconciliationDraftsOnSignOut } from '../useClearReconciliationDraftsOnSignOut'

const KEY_A = draftKey('u-1', { reconciliationId: 'r-1' })
const KEY_B = draftKey('u-2', { createToken: 't-1' })

describe('reconciliation drafts and sign-out', () => {
  beforeEach(() => {
    sessionStorage.clear()
    sessionStorage.setItem(KEY_A, '{"v":1}')
    sessionStorage.setItem(KEY_B, '{"v":1}')
    sessionStorage.setItem('unrelated', 'keep')
  })

  it('clearAllDrafts removes every draft key and nothing else', () => {
    clearAllDrafts()
    expect(sessionStorage.getItem(KEY_A)).toBeNull()
    expect(sessionStorage.getItem(KEY_B)).toBeNull()
    expect(sessionStorage.getItem('unrelated')).toBe('keep')
  })

  it('clears drafts when the session goes from signed-in to signed-out', () => {
    const { rerender } = renderHook(({ auth }) => useClearReconciliationDraftsOnSignOut(auth, false), {
      initialProps: { auth: true },
    })
    expect(sessionStorage.getItem(KEY_A)).not.toBeNull()

    rerender({ auth: false })
    expect(sessionStorage.getItem(KEY_A)).toBeNull()
    expect(sessionStorage.getItem(KEY_B)).toBeNull()
    expect(sessionStorage.getItem('unrelated')).toBe('keep')
  })

  it('clears drafts on load when the tab is not signed in (browser-restored tab after sign-out)', () => {
    renderHook(() => useClearReconciliationDraftsOnSignOut(false, false))
    expect(sessionStorage.getItem(KEY_A)).toBeNull()
    expect(sessionStorage.getItem(KEY_B)).toBeNull()
    expect(sessionStorage.getItem('unrelated')).toBe('keep')
  })

  it('keeps drafts on load and on re-render while the tab stays signed in (reload of a signed-in tab)', () => {
    const { rerender } = renderHook(({ auth }) => useClearReconciliationDraftsOnSignOut(auth, false), {
      initialProps: { auth: true },
    })
    rerender({ auth: true })
    expect(sessionStorage.getItem(KEY_A)).not.toBeNull()
    expect(sessionStorage.getItem(KEY_B)).not.toBeNull()
  })

  // Storage has not said whether a session is stored: not signed in, and not
  // signed-out either.
  it('keeps drafts while the tab waits for session storage', () => {
    const { rerender } = renderHook(({ auth, waiting }) => useClearReconciliationDraftsOnSignOut(auth, waiting), {
      initialProps: { auth: false, waiting: true },
    })
    rerender({ auth: false, waiting: true })
    expect(sessionStorage.getItem(KEY_A)).not.toBeNull()
    expect(sessionStorage.getItem(KEY_B)).not.toBeNull()
  })

  it('keeps drafts when the wait ends with the session found', () => {
    const { rerender } = renderHook(({ auth, waiting }) => useClearReconciliationDraftsOnSignOut(auth, waiting), {
      initialProps: { auth: false, waiting: true },
    })
    rerender({ auth: true, waiting: false })
    expect(sessionStorage.getItem(KEY_A)).not.toBeNull()
    expect(sessionStorage.getItem(KEY_B)).not.toBeNull()
  })

  it('clears drafts when the wait ends with the tab signed-out', () => {
    const { rerender } = renderHook(({ auth, waiting }) => useClearReconciliationDraftsOnSignOut(auth, waiting), {
      initialProps: { auth: false, waiting: true },
    })
    rerender({ auth: false, waiting: false })
    expect(sessionStorage.getItem(KEY_A)).toBeNull()
    expect(sessionStorage.getItem(KEY_B)).toBeNull()
    expect(sessionStorage.getItem('unrelated')).toBe('keep')
  })
})
