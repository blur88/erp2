import { it, expect, vi } from 'vitest'
const { factory } = vi.hoisted(() => ({ factory: () => ({ store: {} }) }))
vi.mock('@/store', factory)
import { store } from '@/store'
it('loads', () => expect(store).toEqual({}))
