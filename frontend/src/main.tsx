import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Provider } from 'react-redux'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CssBaseline from '@mui/material/CssBaseline'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'

import { PersistGate } from 'redux-persist/integration/react'
import { store, persistor } from './store'
import { router } from './router'
import { NotificationProvider } from './hooks/useNotification'
import { WebSocketProvider } from './hooks/useWebSocket'
import ThemeWrapper from './components/common/ThemeWrapper'

import './styles/global.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 1,
    },
  },
})

if ((import.meta as any).env?.DEV) {
  import('@tanstack/react-query-devtools').then(() => {
    // Devtools loaded only in development.
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ThemeWrapper>
          <CssBaseline />
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <NotificationProvider>
              <WebSocketProvider>
                <PersistGate loading={null} persistor={persistor}>
                  <RouterProvider router={router} />
                </PersistGate>
              </WebSocketProvider>
            </NotificationProvider>
          </LocalizationProvider>
        </ThemeWrapper>
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>,
)
