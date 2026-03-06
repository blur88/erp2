import { configureStore } from '@reduxjs/toolkit'
import { persistStore, persistReducer } from 'redux-persist'
import storage from 'redux-persist/lib/storage'
import { combineReducers } from '@reduxjs/toolkit'

// Import slices
import themeSlice from './slices/themeSlice'
import authSlice from './slices/authSlice'
import notificationSlice from './slices/notificationSlice'
import inventorySlice from './slices/inventorySlice'
import salesSlice from './slices/salesSlice'
import purchasingSlice from './slices/purchasingSlice'
import backupSlice from './slices/backupSlice'
import auditLogSlice from './slices/auditLogSlice'
import priceListSlice from './slices/priceListSlice'
import chartOfAccountsSlice from './slices/chartOfAccountsSlice'
import journalEntriesSlice from './slices/journalEntriesSlice'
import fiscalPeriodsSlice from './slices/fiscalPeriodsSlice'
import accountMappingsSlice from './slices/accountMappingsSlice'
import accountingReportsSlice from './slices/accountingReportsSlice'
import bankReconciliationsSlice from './slices/bankReconciliationsSlice'
import paymentMethodsSlice from './slices/paymentMethodsSlice'
import settlementsSlice from './slices/settlementsSlice'
import ownerEquitySlice from './slices/ownerEquitySlice'
import expenseSlice from './slices/expenseSlice'
import { auditLogApiSlice } from './api/auditLogApi'
import { backupApiSlice } from './api/backupApi'
import { priceListApiSlice } from './api/priceListApi'
import { userManagementApiSlice } from './api/userManagementApi'
import { inventoryApiSlice } from './api/inventoryApi'
import { purchasingApiSlice } from './api/purchasingApi'
import { salesApiSlice } from './api/salesApi'
import { accountingApiSlice } from './api/accountingApi'

const rootReducer = combineReducers({
  theme: themeSlice,
  auth: authSlice,
  notifications: notificationSlice,
  inventory: inventorySlice,
  sales: salesSlice,
  purchasing: purchasingSlice,
  backup: backupSlice,
  auditLogs: auditLogSlice,
  priceLists: priceListSlice,
  chartOfAccounts: chartOfAccountsSlice,
  journalEntries: journalEntriesSlice,
  fiscalPeriods: fiscalPeriodsSlice,
  accountMappings: accountMappingsSlice,
  accountingReports: accountingReportsSlice,
  bankReconciliations: bankReconciliationsSlice,
  paymentMethods: paymentMethodsSlice,
  settlements: settlementsSlice,
  ownerEquity: ownerEquitySlice,
  expenses: expenseSlice,
  [auditLogApiSlice.reducerPath]: auditLogApiSlice.reducer,
  [backupApiSlice.reducerPath]: backupApiSlice.reducer,
  [priceListApiSlice.reducerPath]: priceListApiSlice.reducer,
  [userManagementApiSlice.reducerPath]: userManagementApiSlice.reducer,
  [inventoryApiSlice.reducerPath]: inventoryApiSlice.reducer,
  [purchasingApiSlice.reducerPath]: purchasingApiSlice.reducer,
  [salesApiSlice.reducerPath]: salesApiSlice.reducer,
  [accountingApiSlice.reducerPath]: accountingApiSlice.reducer,
})

// Persist configuration
const persistConfig = {
  key: 'erp-app',
  storage,
  whitelist: ['theme', 'auth'],
  version: 4,
  migrate: (state: any) => {
    // Force dark mode for all users on version 2+
    if (state) {
      const newState = {
        ...state,
        theme: state.theme ? {
          ...state.theme,
          mode: 'dark'
        } : { mode: 'dark' }
      };

      return Promise.resolve(newState);
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
  }).concat(
    auditLogApiSlice.middleware as any,
    backupApiSlice.middleware as any,
    priceListApiSlice.middleware as any,
    userManagementApiSlice.middleware as any,
    inventoryApiSlice.middleware as any,
    purchasingApiSlice.middleware as any,
    salesApiSlice.middleware as any,
    accountingApiSlice.middleware as any,
  ),
  devTools: process.env.NODE_ENV !== 'production',
})

export const persistor = persistStore(store)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

// Typed hooks
export { useAppDispatch, useAppSelector } from '../hooks/useRedux'
