import { beforeAll, it } from 'vitest'
beforeAll(async () => {
  await fetch('http://localhost:3001/__gate_setup__').catch(() => undefined)
  throw new Error('fixture setup failure prevents afterEach')
})
it('never reaches its body', () => {})
