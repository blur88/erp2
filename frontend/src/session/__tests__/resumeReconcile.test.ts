import { describe, it, expect, vi } from 'vitest'
import { attachResumeReconcile, type ResumeTargets } from '../resumeReconcile'

function makeTargets(initialVisibility: 'visible' | 'hidden' = 'visible') {
  const docListeners = new Map<string, () => void>()
  const winListeners = new Map<string, () => void>()
  const doc = {
    visibilityState: initialVisibility as DocumentVisibilityState,
    addEventListener: (type: string, fn: () => void) => docListeners.set(type, fn),
    removeEventListener: (type: string) => docListeners.delete(type),
  }
  const win = {
    addEventListener: (type: string, fn: () => void) => winListeners.set(type, fn),
    removeEventListener: (type: string) => winListeners.delete(type),
  }
  const targets: ResumeTargets = { document: doc, window: win }
  return {
    targets,
    doc,
    setVisibility: (v: DocumentVisibilityState) => {
      doc.visibilityState = v
    },
    fireVisibility: () => docListeners.get('visibilitychange')?.(),
    firePageShow: () => winListeners.get('pageshow')?.(),
    hasVisibility: () => docListeners.has('visibilitychange'),
    hasPageShow: () => winListeners.has('pageshow'),
  }
}

describe('attachResumeReconcile', () => {
  it('becoming visible reconciles once', () => {
    const t = makeTargets('visible')
    const runtime = { reconcileNow: vi.fn().mockResolvedValue(undefined) }
    attachResumeReconcile(runtime, t.targets)
    t.setVisibility('visible')
    t.fireVisibility()
    expect(runtime.reconcileNow).toHaveBeenCalledTimes(1)
  })

  it('becoming hidden does not reconcile', () => {
    const t = makeTargets('hidden')
    const runtime = { reconcileNow: vi.fn().mockResolvedValue(undefined) }
    attachResumeReconcile(runtime, t.targets)
    t.setVisibility('hidden')
    t.fireVisibility()
    expect(runtime.reconcileNow).not.toHaveBeenCalled()
  })

  it.each([true, false])('pageshow reconciles with persisted %s', (persisted) => {
    const t = makeTargets()
    const runtime = { reconcileNow: vi.fn().mockResolvedValue(undefined) }
    attachResumeReconcile(runtime, t.targets)
    t.firePageShow()
    expect(runtime.reconcileNow).toHaveBeenCalledTimes(1)
    void persisted
  })

  it('a rejected reconcile is swallowed', async () => {
    const t = makeTargets('visible')
    const runtime = { reconcileNow: vi.fn().mockRejectedValue(new Error('nope')) }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    attachResumeReconcile(runtime, t.targets)
    t.fireVisibility()
    await new Promise((r) => setTimeout(r, 0))
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('detach removes both listeners', () => {
    const t = makeTargets('visible')
    const runtime = { reconcileNow: vi.fn().mockResolvedValue(undefined) }
    const detach = attachResumeReconcile(runtime, t.targets)
    detach()
    t.fireVisibility()
    t.firePageShow()
    expect(runtime.reconcileNow).not.toHaveBeenCalled()
  })
})
