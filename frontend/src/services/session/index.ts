import { SessionCoordinator } from './coordinator'
import { IndexedDbSessionStorage } from './storage'

// Construction does not open storage or install listeners.
export const sessionCoordinator = new SessionCoordinator({ storage: new IndexedDbSessionStorage() })
