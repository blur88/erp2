import { expect, afterAll, afterEach, beforeAll, vi } from 'vitest'
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined
let consoleWarnSpy: ReturnType<typeof vi.spyOn> | undefined
const isJsdomEnvironment =
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  typeof navigator !== 'undefined'

if (isJsdomEnvironment) {
  const [{ cleanup }, matchersModule, { default: ButtonBase }] = await Promise.all([
    import('@testing-library/react'),
    import('@testing-library/jest-dom/matchers'),
    import('@mui/material/ButtonBase'),
  ])

  expect.extend(matchersModule)

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
}

vi.mock('@mui/material/Grow', () => ({
  default: ({ children }: any) => children,
}))

vi.mock('@mui/material/Fade', () => ({
  default: ({ children }: any) => children,
}))

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

// TEMP TEST
