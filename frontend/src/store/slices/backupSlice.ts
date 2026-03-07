import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { BackupLog, BackupSchedule } from '@/services/backupService'
import type { RootState } from '@/store'

interface BackupUIState {
  currentBackup: BackupLog | null
  currentSchedule: BackupSchedule | null
}

const initialState: BackupUIState = {
  currentBackup: null,
  currentSchedule: null,
}

const backupSlice = createSlice({
  name: 'backup',
  initialState,
  reducers: {
    setCurrentBackup: (state, action: PayloadAction<BackupLog | null>) => {
      state.currentBackup = action.payload
    },
    setCurrentSchedule: (state, action: PayloadAction<BackupSchedule | null>) => {
      state.currentSchedule = action.payload
    },
  },
})

export const { setCurrentBackup, setCurrentSchedule } = backupSlice.actions

export default backupSlice.reducer
