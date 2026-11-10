import { it, expect, vi } from 'vitest'
import { store } from '@/store'
vi.doMock('@/store', () => ({ store: {} }))
it('loads', () => expect(store).toBeDefined())
