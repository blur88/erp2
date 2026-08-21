import { bcryptRounds } from './bcrypt-rounds';

describe('bcryptRounds', () => {
  const original = process.env.NODE_ENV;
  const hadNodeEnv = 'NODE_ENV' in process.env;

  afterEach(() => {
    // Restore by deleting when it was originally unset: assigning undefined
    // would leave the string 'undefined', which is not the same environment
    // and would quietly invalidate the unset case below.
    if (hadNodeEnv) {
      process.env.NODE_ENV = original;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  it('uses the cheap cost factor under the test runner', () => {
    process.env.NODE_ENV = 'test';
    expect(bcryptRounds()).toBe(4);
  });

  it('uses the production cost factor in production', () => {
    process.env.NODE_ENV = 'production';
    expect(bcryptRounds()).toBe(12);
  });

  it('uses the production cost factor in development', () => {
    process.env.NODE_ENV = 'development';
    expect(bcryptRounds()).toBe(12);
  });

  it('uses the production cost factor when NODE_ENV is unset', () => {
    // The safe default: an unrecognised or absent environment must never be
    // read as a licence to hash cheaply.
    delete process.env.NODE_ENV;
    expect(bcryptRounds()).toBe(12);
  });

  it('reads NODE_ENV at call time, not at module load', () => {
    process.env.NODE_ENV = 'production';
    expect(bcryptRounds()).toBe(12);
    process.env.NODE_ENV = 'test';
    expect(bcryptRounds()).toBe(4);
  });
});
