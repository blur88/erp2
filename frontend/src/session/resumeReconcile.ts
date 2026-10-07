import type { SessionRuntime } from './runtime'

export interface ResumeTargets {
  document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>
}

export function attachResumeReconcile(
  runtime: Pick<SessionRuntime, 'reconcileNow'>,
  targets?: ResumeTargets,
): () => void {
  const doc = targets?.document ?? (typeof document !== 'undefined' ? document : undefined)
  const win = targets?.window ?? (typeof window !== 'undefined' ? window : undefined)

  const onVisibility = () => {
    if (doc?.visibilityState === 'visible') {
      void runtime.reconcileNow().catch(logReconcileFailure)
    }
  }

  const onPageShow = () => {
    void runtime.reconcileNow().catch(logReconcileFailure)
  }

  doc?.addEventListener('visibilitychange', onVisibility)
  win?.addEventListener('pageshow', onPageShow)

  return () => {
    doc?.removeEventListener('visibilitychange', onVisibility)
    win?.removeEventListener('pageshow', onPageShow)
  }
}

function logReconcileFailure(error: unknown): void {
  console.warn('session reconcile on resume failed', error)
}
