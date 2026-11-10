import { it, expect, vi } from 'vitest'
vi.mock('@/store', () => ({ store: {}, persistor: {} }))
import { store } from '@/store'
it('loads', () => expect(store).toEqual({}))
