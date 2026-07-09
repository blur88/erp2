import { configureStore } from '@reduxjs/toolkit'
import { persistStore, persistReducer } from 'redux-persist'
const storage = {
  getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
  setItem: (key: string, value: string) => Promise.resolve(localStorage.setItem(key, value)),
  removeItem: (key: string) => Promise.resolve(localStorage.removeItem(key)),
}
import { combineReducers } from '@reduxjs/toolkit'

// Import slices
import authSlice from './slices/authSlice'
import notificationSlice from './slices/notificationSlice'
import inventorySlice from './slices/inventorySlice'
import salesSlice from './slices/salesSlice'
import backupSlice from './slices/backupSlice'
import auditLogSlice from './slices/auditLogSlice'
import priceListSlice from './slices/priceListSlice'
import { auditLogApiSlice } from './api/auditLogApi'
import { backupApiSlice } from './api/backupApi'
import { priceListApiSlice } from './api/priceListApi'
import { userManagementApiSlice } from './api/userManagementApi'
import { inventoryApiSlice } from './api/inventoryApi'
import { purchasingApiSlice } from './api/purchasingApi'
import { salesApiSlice } from './api/salesApi'
import { settingsApiSlice } from './api/settingsApi'
import { paymentMethodsApiSlice } from './api/paymentMethodsApi'
import { printSettingsApiSlice } from './api/printSettingsApi'
import { searchApiSlice } from './api/searchApi'
import { PERSIST_KEY } from './persistKey'

const rootReducer = combineReducers({
  auth: authSlice,
  notifications: notificationSlice,
  inventory: inventorySlice,
  sales: salesSlice,
  backup: backupSlice,
  auditLogs: auditLogSlice,
  priceLists: priceListSlice,
  [auditLogApiSlice.reducerPath]: auditLogApiSlice.reducer,
  [backupApiSlice.reducerPath]: backupApiSlice.reducer,
  [priceListApiSlice.reducerPath]: priceListApiSlice.reducer,
  [userManagementApiSlice.reducerPath]: userManagementApiSlice.reducer,
  [inventoryApiSlice.reducerPath]: inventoryApiSlice.reducer,
  [purchasingApiSlice.reducerPath]: purchasingApiSlice.reducer,
  [salesApiSlice.reducerPath]: salesApiSlice.reducer,
  [settingsApiSlice.reducerPath]: settingsApiSlice.reducer,
  [paymentMethodsApiSlice.reducerPath]: paymentMethodsApiSlice.reducer,
  [printSettingsApiSlice.reducerPath]: printSettingsApiSlice.reducer,
  [searchApiSlice.reducerPath]: searchApiSlice.reducer,
})

// Persist configuration
const persistConfig = {
  key: PERSIST_KEY,
  storage,
  whitelist: ['auth', 'notifications'],
  version: 6,
  migrate: (state: any) => {
    // Migration runs when persisted _persist.version !== persistConfig.version.
    // For all existing v4 users, state.notifications is undefined (was not
    // whitelisted), so the ?? [] fallback is the normal code path.
    // On a cold start (no persisted state at all), redux-persist does not call
    // migrate — REHYDRATE fires with payload === undefined instead.
    if (state) {
      const notifications: any[] = state.notifications?.notifications ?? []
      const capped = notifications.slice(0, 50) // newest-first invariant
      const unreadCount = capped.filter((n: any) => !n.read).length

      return Promise.resolve({
        ...state,
        notifications: {
          notifications: capped,
          unreadCount,
        },
      })
    }
    return Promise.resolve(state)
  },
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
  }).concat(
    auditLogApiSlice.middleware as any,
    backupApiSlice.middleware as any,
    priceListApiSlice.middleware as any,
    userManagementApiSlice.middleware as any,
    inventoryApiSlice.middleware as any,
    purchasingApiSlice.middleware as any,
    salesApiSlice.middleware as any,
    settingsApiSlice.middleware as any,
    paymentMethodsApiSlice.middleware as any,
    printSettingsApiSlice.middleware as any,
    searchApiSlice.middleware as any,
  ),
  devTools: import.meta.env.MODE !== 'production',
})

export const persistor = persistStore(store)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

// Typed hooks
export { useAppDispatch, useAppSelector } from '../hooks/useRedux'
