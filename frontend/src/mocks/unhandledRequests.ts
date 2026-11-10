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
    throw new Error([
      'Unhandled MSW requests:',
      ...pending,
      '',
      'Add a handler with server.use(...) or in the shared handlers.',
      'For a deliberate rejection test, call consumeUnhandledRequests() and assert the exact entries.',
      'See docs/frontend/testing-and-print.md#unhandled-msw-requests.',
    ].join('\n'))
  }
}
