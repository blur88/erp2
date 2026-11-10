import { it, expect, vi } from 'vitest'
import { store } from '@/store'
it('loads', () => expect(store).toBeDefined())
