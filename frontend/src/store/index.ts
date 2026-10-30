import { configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
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
import { sessionCoordinator } from '@/services/session'
import { clearAllDrafts } from '@/pages/accounting/bank-reconciliations/reconciliationDraftStorage'
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

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
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

const apiSlices = [auditLogApiSlice, backupApiSlice, priceListApiSlice, userManagementApiSlice,
  inventoryApiSlice, purchasingApiSlice, salesApiSlice, settingsApiSlice, paymentMethodsApiSlice,
  printSettingsApiSlice, searchApiSlice, accountingApiSlice, redisMonitoringApiSlice]
sessionCoordinator.setCleanup((next) => {
  store.dispatch(clearAuth())
  clearAllDrafts()
  for (const api of apiSlices) store.dispatch(api.util.resetApiState())
  if (!next) window.location.assign('/login')
})

export const sessionReady = sessionCoordinator.start().then(() => undefined)
sessionCoordinator.subscribe(session => {
  if (session) store.dispatch(setCredentials({ ...session, expiresIn: 0, rememberMe: session.rememberMe }))
  else store.dispatch(clearAuth())
})
setupListeners(store.dispatch)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
