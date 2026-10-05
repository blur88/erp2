import type { Decision } from '../decisions'
import type { StoredState } from '../types'

export interface SessionStore {
  read(opts?: { timeoutMs?: number }): Promise<StoredState>
  transact<R>(decide: (s: StoredState) => Decision<R>, opts?: { timeoutMs?: number }): Promise<R>
  onClosed(listener: () => void): () => void
}
