import { createElement } from 'react';
import { expect, afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import ButtonBase from '@mui/material/ButtonBase';

// Tell React this is an act-aware test environment.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');

  const BrowserRouter = ({ future, children, ...props }: any) =>
    createElement(
      actual.BrowserRouter as any,
      {
        ...props,
        future: future ?? routerFutureFlags,
      },
      children
    );

  const MemoryRouter = ({ future, children, ...props }: any) =>
    createElement(
      actual.MemoryRouter as any,
      {
        ...props,
        future: future ?? routerFutureFlags,
      },
      children
    );

  return {
    ...actual,
    BrowserRouter,
    MemoryRouter,
  };
});

// Remove MUI transition async updates in tests to reduce act(...) noise.
vi.mock('@mui/material/Grow', () => ({
  default: ({ children }: any) => children,
}));

vi.mock('@mui/material/Fade', () => ({
  default: ({ children }: any) => children,
}));

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

beforeAll(() => {
  const originalConsoleError = console.error;

  // Filter known React test-environment warning spam while keeping real errors.
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    const message = args.find((arg) => typeof arg === 'string') as string | undefined;
    if (message?.includes('not wrapped in act(...)')) {
      return;
    }

    originalConsoleError(...args);
  });
});

afterAll(() => {
  consoleErrorSpy?.mockRestore();
});

// Prevent MUI ripple timers from causing act(...) warnings in tests.
const buttonBase = ButtonBase as any;
buttonBase.defaultProps = {
  ...buttonBase.defaultProps,
  disableRipple: true,
  disableTouchRipple: true,
  focusRipple: false,
};

// Cleanup after each test
afterEach(() => {
  cleanup();
});
