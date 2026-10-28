import { it, expect, vi } from 'vitest'
import type { RootState } from '@/store'
const value: RootState | undefined = undefined
it('erases', () => expect(value).toBeUndefined())
