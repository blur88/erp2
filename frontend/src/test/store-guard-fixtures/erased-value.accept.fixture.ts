import { it, expect, vi } from 'vitest'
import { RootState } from '@/store'
const value: RootState | undefined = undefined
it('erases', () => expect(value).toBeUndefined())
