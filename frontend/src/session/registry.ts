import type { SessionRuntime } from './runtime'

// Breaks the store <-> session import cycle: the store's redux-persist adapter
// and the HTTP interceptors read the runtime from here, and `session/index.ts`
// registers it at startup.
let registered: SessionRuntime | null = null
let announceRegistration: () => void = () => undefined
const registration = new Promise<void>((resolve) => {
  announceRegistration = resolve
})

export function registerSessionRuntime(runtime: SessionRuntime): void {
  registered = runtime
  announceRegistration()
}

export function getSessionRuntime(): SessionRuntime | null {
  return registered
}

// The store module is evaluated before `session/index.ts`, so redux-persist asks
// for the persisted slices before any runtime exists. This resolves once one is
// registered and its `start()` has settled, whatever state that left it in.
export async function startedSessionRuntime(): Promise<SessionRuntime> {
  await registration
  const runtime = registered as SessionRuntime
  await runtime.whenStarted()
  return runtime
}
