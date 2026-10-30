import { sessionCoordinator } from '@/services/session'

/** Every request finishes its shared read before attaching credentials. */
export function getCredentials() {
  return sessionCoordinator.credentialsForRequest()
}
