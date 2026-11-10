import { it } from 'vitest'
it('absorbs unmocked GET and POST errors', async () => {
  await fetch('http://localhost:3001/__gate_get__').catch(() => undefined)
  await fetch('http://localhost:3001/__gate_post__', { method: 'POST' }).catch(() => undefined)
})
