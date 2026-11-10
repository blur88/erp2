import { IDBFactory } from 'fake-indexeddb'
import { SessionCoordinator } from '@/services/session/coordinator'
import { IndexedDbSessionStorage } from '@/services/session/storage'
import type { AuthResponse } from '@/store/slices/authSlice'

/** An isolated shared database without evaluating the application store. */
export async function createTestSession(accessToken = 'access', refreshToken = 'refresh') {
  const coordinator = new SessionCoordinator({ storage: new IndexedDbSessionStorage(new IDBFactory()) })
  await coordinator.start()
  await coordinator.signIn({ accessToken, refreshToken, user: { id: 'test-user' }, expiresIn: 900 } as AuthResponse)
  return coordinator
}
