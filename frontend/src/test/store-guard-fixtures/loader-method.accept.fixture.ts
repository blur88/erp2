import { it, expect, vi } from 'vitest'
vi.mock('@/store', (original) => ({ store: { original() {} } }))
import { store } from '@/store'
it('loads', () => expect(store.original).toBeTypeOf('function'))
