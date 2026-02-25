import { createElement } from 'react';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import ButtonBase from '@mui/material/ButtonBase';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

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

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Prevent MUI ripple timers from causing act(...) warnings in tests.
const buttonBase = ButtonBase as any;
buttonBase.defaultProps = {
  ...buttonBase.defaultProps,
  disableRipple: true,
};

// Cleanup after each test
afterEach(() => {
  cleanup();
});
