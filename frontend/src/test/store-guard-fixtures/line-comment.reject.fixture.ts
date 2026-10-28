import { it, expect, vi } from 'vitest'
// vi.mock('@/store', () => ({ store: {} }))
import { store } from '@/store'
it('loads', () => expect(store).toBeDefined())
