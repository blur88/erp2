import { configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import { persistStore, persistReducer } from 'redux-persist'
// Guard localStorage access: redux-persist debounces writes, which under
// vitest can fire after the jsdom environment (and its localStorage) is torn
// down — an unhandled ReferenceError that fails the whole run.
const hasLocalStorage = () => typeof localStorage !== 'undefined'
const storage = {
  getItem: (key: string) => Promise.resolve(hasLocalStorage() ? localStorage.getItem(key) : null),
  setItem: (key: string, value: string) => Promise.resolve(hasLocalStorage() ? localStorage.setItem(key, value) : undefined),
  removeItem: (key: string) => Promise.resolve(hasLocalStorage() ? localStorage.removeItem(key) : undefined),
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
import { accountingApiSlice } from './api/accountingApi'
import { redisMonitoringApiSlice } from './api/redisMonitoringApi'
import { PERSIST_KEY } from './persistKey'
import { sessionCoordinator } from '@/services/session'
import { clearAuth, setCredentials } from './slices/authSlice'

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
  [accountingApiSlice.reducerPath]: accountingApiSlice.reducer,
  [redisMonitoringApiSlice.reducerPath]: redisMonitoringApiSlice.reducer,
})

// Persist configuration
const persistConfig = {
  key: PERSIST_KEY,
  storage,
  whitelist: ['notifications'],
  version: 6,
  migrate: (state: any) => {
    // Only notifications are accepted from the new key. Startup removes the
    // legacy combined auth/notification record before persistence starts.
    if (state) {
      const notifications: any[] = state.notifications?.notifications ?? []
      const capped = notifications.slice(0, 50) // newest-first invariant
      const unreadCount = capped.filter((n: any) => !n.read).length

      return Promise.resolve({
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
    accountingApiSlice.middleware as any,
    redisMonitoringApiSlice.middleware as any,
  ),
})

// Start coordination before redux-persist reads the legacy root key.
export const sessionReady = sessionCoordinator.start().then(() => undefined)
sessionCoordinator.subscribe(session => {
  if (session) store.dispatch(setCredentials({ ...session, expiresIn: 0, rememberMe: session.rememberMe }))
  else store.dispatch(clearAuth())
})
// T2 removes notification persistence; auth is never persisted again.
export const persistor = persistStore(store, { manualPersist: true } as any)
void sessionReady.then(() => persistor.persist(), () => {})

setupListeners(store.dispatch)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
