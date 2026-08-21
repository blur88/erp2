// Production bcrypt cost factor. Lowering this weakens every password hash the
// application writes, so it is deliberately not configurable at runtime.
const PRODUCTION_ROUNDS = 12;

// Test cost factor. At 12 rounds a single hash costs roughly a second, which
// pushed users-seeder.service.spec.ts past Jest's 5s default whenever the
// machine was under concurrent load (issue #1109). 4 is bcrypt's minimum and
// still produces a genuine $2b$ hash, so tests asserting hash shape or calling
// bcrypt.compare keep their meaning — only the cost changes.
const TEST_ROUNDS = 4;

/**
 * The bcrypt cost factor to hash with.
 *
 * Read at call time rather than captured at module load, so the value cannot be
 * frozen before the test runner sets NODE_ENV.
 *
 * Only the literal 'test' selects the reduced cost. There is no environment
 * variable to raise or lower it, which makes an accidentally low-cost
 * production deployment impossible rather than merely unlikely.
 */
export function bcryptRounds(): number {
  return process.env.NODE_ENV === 'test' ? TEST_ROUNDS : PRODUCTION_ROUNDS;
}
