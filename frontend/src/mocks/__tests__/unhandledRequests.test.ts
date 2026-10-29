import axios from 'axios'
import { describe, expect, it } from 'vitest'

// Uses the configured shared setup files; never starts a separate MSW server.
describe('shared MSW unhandled-request policy', () => {
  it('rejects an unhandled axios GET without a response', async () => {
    const request = axios.get('http://localhost:3001/__msw_unhandled_axios__')
    await expect(request).rejects.toMatchObject({
      message: expect.stringContaining('Cannot bypass'),
    })
    const error = await request.catch(error => error)
    expect(error.response).toBeUndefined()
  })

  it('rejects an unhandled fetch without a response', async () => {
    await expect(fetch('http://localhost:3001/__msw_unhandled_fetch__')).rejects.toMatchObject({
      cause: { message: expect.stringContaining('Cannot bypass') },
    })
  })
})
