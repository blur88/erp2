import { expect, afterAll, afterEach, beforeAll, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import ButtonBase from '@mui/material/ButtonBase'

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined
let consoleWarnSpy: ReturnType<typeof vi.spyOn> | undefined

vi.mock('@mui/material/Grow', () => ({
  default: ({ children }: any) => children,
}))

vi.mock('@mui/material/Fade', () => ({
  default: ({ children }: any) => children,
}))

expect.extend(matchers)

beforeAll(() => {
  const originalConsoleError = console.error
  const originalConsoleWarn = console.warn

  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    const message = args.find((arg) => typeof arg === 'string') as string | undefined
    if (message?.includes('not wrapped in act(...)')) {
      return
    }

    originalConsoleError(...args)
  })

  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
    const message = args.find((arg) => typeof arg === 'string') as string | undefined
    if (message?.includes('GridLegacy component is deprecated')) {
      return
    }

    originalConsoleWarn(...args)
  })
})

afterAll(() => {
  consoleErrorSpy?.mockRestore()
  consoleWarnSpy?.mockRestore()
})

const buttonBase = ButtonBase as any
buttonBase.defaultProps = {
  ...buttonBase.defaultProps,
  disableRipple: true,
  disableTouchRipple: true,
  focusRipple: false,
}

afterEach(() => {
  cleanup()
})
