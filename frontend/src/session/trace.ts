// Opt-in trace of the refresh path (spec "Instrumentation"). Nothing is
// recorded unless the runtime is given an `onTrace` dependency. An event
// carries generations, outcomes and durations; it never carries a token or a
// fingerprint.
export type TraceBody =
  | {
      type: 'settled-read'
      storedGeneration: number | null
      memoryGeneration: number | null
      result: 'retry' | 'ended' | 'proceed'
      ms: number
    }
  | { type: 'lease-acquire'; acquired: boolean; expiresAt: number | null; ms: number }
  | { type: 'refresh-sent'; presentedGeneration: number }
  | {
      type: 'refresh-answered'
      status: 'ok' | 'rejected' | 'error'
      returnedGeneration: number | null
      ms: number
    }
  | {
      type: 'token-commit'
      trigger: 'inline' | 'reconcile' | 'refresh' | 'final-401'
      attempt: number
      triggeredBy: number | null
      outcome: 'written-both' | 'written-access' | 'discarded' | 'session-mismatch' | 'timeout' | 'unavailable'
      ms: number
    }
  | { type: 'lease-release'; outcome: 'released' | 'not-owner' | 'failed' | 'skipped-pending'; ms: number }
  | {
      type: 'pending-dropped'
      reason: 'written' | 'discarded' | 'session-mismatch' | 'claim-changed' | 'storage-unavailable'
    }

export type TraceEvent = TraceBody & { tabId: string; at: number; refreshId: number }
