import React from 'react'
import { ThemeProvider } from '@mui/material/styles'
import { darkTheme } from '@/styles/theme'

interface ThemeWrapperProps {
  children: React.ReactNode
}

const ThemeWrapper: React.FC<ThemeWrapperProps> = ({ children }) => {
  return <ThemeProvider theme={darkTheme}>{children}</ThemeProvider>
}

export default ThemeWrapper
