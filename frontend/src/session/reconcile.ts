import type { ActiveSession, SessionRecord } from './types'

export type ReconcileAction = 'none' | 'adopt-tokens' | 'adopt-access' | 'end-locally'

export function reconcile(claim: string | null, memory: ActiveSession | null, stored: SessionRecord): ReconcileAction {
  if (claim === null) return 'none'

  const remote = stored.session
  if (remote === null || remote.sessionId !== claim) return 'end-locally'

  if (memory === null) return 'adopt-tokens'

  if (remote.generation > memory.generation) return 'adopt-tokens'
  if (remote.generation < memory.generation) return 'end-locally'

  if (remote.accessTokenExpiresAt > memory.accessTokenExpiresAt) return 'adopt-access'
  return 'none'
}
