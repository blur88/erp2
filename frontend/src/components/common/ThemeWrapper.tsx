import React, { useMemo } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import { useAppSelector } from '@/hooks/useRedux'
import { selectThemeMode } from '@/store/slices/themeSlice'
import { lightTheme, darkTheme } from '@/styles/theme'

interface ThemeWrapperProps {
  children: React.ReactNode
}

const ThemeWrapper: React.FC<ThemeWrapperProps> = ({ children }) => {
  const themeMode = useAppSelector(selectThemeMode)

  const theme = useMemo(() => {
    return themeMode === 'dark' ? darkTheme : lightTheme
  }, [themeMode])

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}

export default ThemeWrapper
