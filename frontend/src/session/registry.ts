import type { SessionRuntime } from './runtime'

// Breaks the store <-> session import cycle: the store's redux-persist adapter
// and the HTTP interceptors read the runtime from here, and `session/index.ts`
// registers it at startup.
let registered: SessionRuntime | null = null

export function registerSessionRuntime(runtime: SessionRuntime): void {
  registered = runtime
}

export function getSessionRuntime(): SessionRuntime | null {
  return registered
}
