import { SessionCoordinator } from './coordinator'
import { IndexedDbSessionStorage } from './storage'

// Browser resources are acquired only at startup, alongside storage.
let channel: BroadcastChannel | undefined
export const sessionCoordinator = new SessionCoordinator({
  storage: new IndexedDbSessionStorage(),
  channel: {
    postMessage(message) { channel?.postMessage(message) },
    subscribe(listener) {
      channel = new BroadcastChannel('erp-session')
      channel.addEventListener('message', listener)
      return () => channel?.removeEventListener('message', listener)
    },
    close() { channel?.close() },
  },
  resumeTargets: typeof window === 'undefined' ? undefined : { window, document },
  onError(error) { window.alert(error instanceof Error ? error.message : String(error)) },
})
