import React, { createContext, useContext, useEffect, useState } from 'react'

const LayoutScrollContext = createContext<boolean>(false)
const LayoutScrollSetContext = createContext<React.Dispatch<React.SetStateAction<boolean>>>(() => {})

export const LayoutScrollProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scrollEnabled, setScrollEnabled] = useState(false)
  return (
    <LayoutScrollContext.Provider value={scrollEnabled}>
      <LayoutScrollSetContext.Provider value={setScrollEnabled}>
        {children}
      </LayoutScrollSetContext.Provider>
    </LayoutScrollContext.Provider>
  )
}

export const useLayoutScrollContext = () => useContext(LayoutScrollContext)

export const useLayoutScroll = (enabled: boolean) => {
  const setScrollEnabled = useContext(LayoutScrollSetContext)
  useEffect(() => {
    setScrollEnabled(enabled)
    return () => setScrollEnabled(false)
  }, [enabled, setScrollEnabled])
}
