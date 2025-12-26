import { configureStore } from '@reduxjs/toolkit'
import { persistStore, persistReducer } from 'redux-persist'
import storage from 'redux-persist/lib/storage'
import { combineReducers } from '@reduxjs/toolkit'

// Import slices
import themeSlice from './slices/themeSlice'
import notificationSlice from './slices/notificationSlice'
import inventorySlice from './slices/inventorySlice'
import salesSlice from './slices/salesSlice'
import customerSlice from './slices/customerSlice'
import purchasingSlice from './slices/purchasingSlice'
import supplierSlice from './slices/supplierSlice'
import dashboardSlice from './slices/dashboardSlice'
import backupSlice from './slices/backupSlice'

const rootReducer = combineReducers({
  theme: themeSlice,
  notifications: notificationSlice,
  inventory: inventorySlice,
  sales: salesSlice,
  customers: customerSlice,
  purchasing: purchasingSlice,
  suppliers: supplierSlice,
  dashboard: dashboardSlice,
  backup: backupSlice,
})

// Persist configuration
const persistConfig = {
  key: 'erp-app',
  storage,
  whitelist: ['theme', 'inventory', 'sales', 'purchasing'], // Persist theme, inventory, sales, and purchasing (including selections)
  version: 2, // Incremented to force dark mode default migration
  migrate: (state: any) => {
    // Force dark mode for all users on version 2
    if (state && state.theme) {
      return Promise.resolve({
        ...state,
        theme: {
          ...state.theme,
          mode: 'dark'
        }
      })
    }
    return Promise.resolve(state)
  }
}

const persistedReducer = persistReducer(persistConfig, rootReducer)

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
        ignoredPaths: ['register'],
      },
    }),
  devTools: process.env.NODE_ENV !== 'production',
})

export const persistor = persistStore(store)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

// Typed hooks
export { useAppDispatch, useAppSelector } from '../hooks/useRedux'