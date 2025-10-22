import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CssBaseline from '@mui/material/CssBaseline'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'

import App from './App'
import { store } from './store'
import { NotificationProvider } from './hooks/useNotification'
import { WebSocketProvider } from './hooks/useWebSocket'
import ThemeWrapper from './components/common/ThemeWrapper'

import './styles/global.css'

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 1,
    },
  },
})

// Enable React Query Devtools in development
if ((import.meta as any).env?.DEV) {
  import('@tanstack/react-query-devtools').then(({ ReactQueryDevtools }) => {
    // Devtools will be added automatically
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <ThemeWrapper>
            <CssBaseline />
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <NotificationProvider>
                <WebSocketProvider>
                  <App />
                </WebSocketProvider>
              </NotificationProvider>
            </LocalizationProvider>
          </ThemeWrapper>
        </QueryClientProvider>
      </Provider>
    </BrowserRouter>
  </React.StrictMode>,
)