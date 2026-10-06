import { configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import { persistStore, persistReducer } from 'redux-persist'
// Guard localStorage access: redux-persist debounces writes, which under
// vitest can fire after the jsdom environment (and its localStorage) is torn
// down — an unhandled ReferenceError that fails the whole run.
const hasLocalStorage = () => typeof localStorage !== 'undefined'
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
import { getSessionRuntime, startedSessionRuntime } from '@/session/registry'
import { RESET_FOR_SESSION_END } from './sessionReset'

export { RESET_FOR_SESSION_END }

const slicedReducer = combineReducers({
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

const initialState = slicedReducer(undefined, { type: '@@INIT' } as never)

// On a session end every slice except `auth` returns to its initial state. RTK
// Query caches are also reset (the session-ending event dispatches
// `util.resetApiState()` for each API slice; this only handles plain slices).
const rootReducer = (state: ReturnType<typeof slicedReducer> | undefined, action: { type: string }) => {
  if (action.type === RESET_FOR_SESSION_END && state) {
    const next = { ...initialState }
    next.auth = state.auth
    return next
  }
  return slicedReducer(state, action as never)
}

// redux-persist storage backed by the session runtime's tagged slices store.
// The runtime is registered lazily by `@/session` to avoid an import cycle.
const storage = {
  // `persistStore` below asks for the stored slices while this module is still
  // being evaluated, before `@/session` has registered a runtime. The read waits
  // for the runtime to exist and to have started, and never fails: whatever
  // cannot be read rehydrates as nothing.
  getItem: async (_key: string): Promise<string | null> => {
    try {
      return await (await startedSessionRuntime()).readSlices()
    } catch {
      return null
    }
  },
  // The payload is stamped here, when redux-persist hands it over, with the
  // session it was produced under. The write itself runs later and is skipped
  // unless that session is still the tab's claim and the stored one (spec B2).
  setItem: (_key: string, value: string) => writeSlices(value),
  removeItem: (_key: string) => writeSlices(null),
}

function writeSlices(json: string | null): Promise<void> {
  const runtime = getSessionRuntime()
  const originSessionId = runtime?.claim() ?? null
  // A signed-out payload never writes.
  if (!runtime || originSessionId === null) return Promise.resolve()
  return runtime.persistSlices(originSessionId, json)
}

// Persist configuration
const persistConfig = {
  key: PERSIST_KEY,
  storage: storage as never,
  whitelist: ['notifications'],
  version: 7,
  migrate: (state: any) => {
    if (state) {
      const notifications: any[] = state.notifications?.notifications ?? []
      const capped = notifications.slice(0, 50) // newest-first invariant
      const unreadCount = capped.filter((n: any) => !n.read).length

      return Promise.resolve({
        notifications: { notifications: capped, unreadCount },
      })
    }
    return Promise.resolve(state)
  },
}

const persistedReducer = persistReducer(persistConfig, rootReducer as never)

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
    serializableCheck: {
      ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE', 'persist/FLUSH', 'persist/PURGE', RESET_FOR_SESSION_END],
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

// The legacy redux-persist key lived in localStorage. It is removed on first
// load now that the shared record is in IndexedDB.
if (hasLocalStorage()) {
  try {
    localStorage.removeItem(`persist:${PERSIST_KEY}`)
  } catch {
    /* ignore */
  }
}

export const persistor = persistStore(store)

setupListeners(store.dispatch)

export type RootState = ReturnType<typeof slicedReducer>
export type AppDispatch = typeof store.dispatch
