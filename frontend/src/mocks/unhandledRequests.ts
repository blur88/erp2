// Shared by the setup gate and tests that intentionally exercise rejection.
const unhandledRequests: string[] = []

export function recordUnhandledRequest(request: Request) {
  unhandledRequests.push(`${request.method} ${request.url}`)
}

// Intentional-request tests must assert the exact entries they consume.
export function consumeUnhandledRequests(): string[] {
  return unhandledRequests.splice(0)
}

export function reportUnhandledRequests() {
  const pending = consumeUnhandledRequests()
  if (pending.length) {
    throw new Error(`Unhandled MSW requests:\n${pending.join('\n')}`)
  }
}
