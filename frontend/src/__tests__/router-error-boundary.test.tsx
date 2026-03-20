import { describe, expect, it } from 'vitest'
import RouteErrorBoundary from '@/components/errors/RouteErrorBoundary'
import { router } from '@/router'

describe('router error boundary wiring', () => {
  it('uses RouteErrorBoundary as the root route errorElement', () => {
    expect(router.routes[0].errorElement?.type).toBe(RouteErrorBoundary)
  })
})
