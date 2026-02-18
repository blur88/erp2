import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import ButtonBase from '@mui/material/ButtonBase';

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
