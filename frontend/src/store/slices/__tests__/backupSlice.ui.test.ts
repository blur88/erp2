import { describe, expect, it } from 'vitest'

import backupReducer, { setCurrentBackup, setCurrentSchedule } from '@/store/slices/backupSlice'

describe('backupSlice UI state', () => {
  it('sets current backup', () => {
    const state = backupReducer(
      undefined,
      setCurrentBackup({ id: 'b-1', filename: 'file.tar.gz' } as any),
    )

    expect(state.currentBackup?.id).toBe('b-1')
  })

  it('sets current schedule', () => {
    const state = backupReducer(
      undefined,
      setCurrentSchedule({ id: 's-1', name: 'Daily backup' } as any),
    )

    expect(state.currentSchedule?.id).toBe('s-1')
  })
})
