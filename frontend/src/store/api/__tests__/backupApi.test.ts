import { describe, expect, it } from 'vitest'

import { backupApiSlice } from '@/store/api/backupApi'

describe('backupApiSlice', () => {
  it('defines expected backup and schedule endpoints', () => {
    expect(backupApiSlice.endpoints.getBackups).toBeDefined()
    expect(backupApiSlice.endpoints.createBackup).toBeDefined()
    expect(backupApiSlice.endpoints.restoreBackup).toBeDefined()
    expect(backupApiSlice.endpoints.deleteBackup).toBeDefined()
    expect(backupApiSlice.endpoints.uploadBackup).toBeDefined()
    expect(backupApiSlice.endpoints.getSchedules).toBeDefined()
    expect(backupApiSlice.endpoints.createSchedule).toBeDefined()
    expect(backupApiSlice.endpoints.updateSchedule).toBeDefined()
    expect(backupApiSlice.endpoints.deleteSchedule).toBeDefined()
    expect(backupApiSlice.endpoints.toggleSchedule).toBeDefined()
    expect(backupApiSlice.endpoints.triggerSchedule).toBeDefined()
  })
})
