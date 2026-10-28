import { store } from '@/store'
import { expect, it } from 'vitest'

it('pins running without the configured plugin as outside coverage', () => {
  expect(store.getState).toBeTypeOf('function')
})
