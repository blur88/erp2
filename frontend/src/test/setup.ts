import { afterAll, afterEach, beforeAll, vi } from 'vitest'
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const storeViolationKey = Symbol.for('erp.test.application-store-violations')
const storeViolations: { stack: string; reported: boolean }[] =
  ((globalThis as any)[storeViolationKey] ??= [])
function reportStoreViolations() {
  const pending = storeViolations.filter(entry => !entry.reported)
  pending.forEach(entry => { entry.reported = true })
  if (pending.length) {
    throw new Error(
      'ERP_APP_STORE_EVALUATION_BLOCKED: use createTestStore (@/test/createTestStore) ' +
      "or a complete hoisted vi.mock('@/store', () => ({ … })) stub.\n" +
      pending.map(entry => entry.stack).join('\n'),
    )
  }
}
afterEach(reportStoreViolations)
afterAll(reportStoreViolations)

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined
let consoleWarnSpy: ReturnType<typeof vi.spyOn> | undefined
const isJsdomEnvironment =
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  typeof navigator !== 'undefined'

if (isJsdomEnvironment) {
  const [{ cleanup }, , { default: ButtonBase }] = await Promise.all([
    import('@testing-library/react'),
    import('@testing-library/jest-dom/vitest'),
    import('@mui/material/ButtonBase'),
  ])

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
