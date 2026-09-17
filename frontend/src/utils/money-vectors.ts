/**
 * Shared precision test vectors (#1241).
 *
 * This file is duplicated byte-for-byte at frontend/src/utils/money-vectors.ts
 * so both implementations are asserted against identical cases. Edit both or
 * neither; Task 6 asserts they agree.
 *
 * Inputs are scale-4 minor units; expectations are scale-4 minor units or
 * formatted strings.
 */

export interface QuantizeVector {
  readonly name: string;
  readonly inputMinor: bigint;
  readonly expectedMinor: bigint;
}

/** HALF-UP away from zero, for both signs. */
export const QUANTIZE_VECTORS: readonly QuantizeVector[] = [
  { name: '1.004 -> 1.00', inputMinor: 10040n, expectedMinor: 10000n },
  { name: '1.005 -> 1.01', inputMinor: 10050n, expectedMinor: 10100n },
  { name: '-1.004 -> -1.00', inputMinor: -10040n, expectedMinor: -10000n },
  { name: '-1.005 -> -1.01', inputMinor: -10050n, expectedMinor: -10100n },
  { name: '-0.0032 -> 0.00', inputMinor: -32n, expectedMinor: 0n },
  { name: '0.0000 -> 0.00', inputMinor: 0n, expectedMinor: 0n },
  { name: '-0.005 -> -0.01 (real negative cent)', inputMinor: -50n, expectedMinor: -100n },
  { name: '0.005 -> 0.01', inputMinor: 50n, expectedMinor: 100n },
  { name: 'already-quantized value is unchanged', inputMinor: 12300n, expectedMinor: 12300n },
  {
    name: 'NUMERIC(18,4) magnitude survives',
    inputMinor: 999999999999990000n,
    expectedMinor: 999999999999990000n,
  },
];

export interface FormatVector {
  readonly name: string;
  readonly inputMinor: bigint;
  readonly expected: string;
}

/** Always exactly two fraction digits; never "-0.00". */
export const FORMAT_VECTORS: readonly FormatVector[] = [
  { name: 'zero', inputMinor: 0n, expected: '0.00' },
  { name: 'negative residual formats as positive zero', inputMinor: -32n, expected: '0.00' },
  { name: 'real negative cent keeps its sign', inputMinor: -100n, expected: '-0.01' },
  { name: 'whole number pads to two digits', inputMinor: 1000000n, expected: '100.00' },
  { name: 'tie rounds away from zero', inputMinor: 10050n, expected: '1.01' },
  { name: 'negative tie rounds away from zero', inputMinor: -10050n, expected: '-1.01' },
];

export interface AllocateVector {
  readonly name: string;
  readonly targetMinor: bigint;
  readonly weightsMinor: readonly bigint[];
  readonly expectedMinor: readonly bigint[];
}

/**
 * Uncapped cost spreading, residual to the LAST eligible line.
 * Shares are truncated toward zero, then leftover units are appended to the
 * last line — deliberately NOT largest-remainder.
 */
export const ALLOCATE_VECTORS: readonly AllocateVector[] = [
  {
    name: 'RM10 across 3 equal weights, residual to last line',
    targetMinor: 100000n,
    weightsMinor: [1n, 1n, 1n],
    expectedMinor: [33333n, 33333n, 33334n],
  },
  {
    name: 'exact division leaves no residual',
    targetMinor: 90000n,
    weightsMinor: [1n, 1n, 1n],
    expectedMinor: [30000n, 30000n, 30000n],
  },
  {
    name: 'proportional to unequal weights',
    targetMinor: 100000n,
    weightsMinor: [1000n, 3000n],
    expectedMinor: [25000n, 75000n],
  },
  {
    name: 'negative target: allocate magnitude, apply sign to every share',
    targetMinor: -100000n,
    weightsMinor: [1n, 1n, 1n],
    expectedMinor: [-33333n, -33333n, -33334n],
  },
  {
    name: 'share may exceed its own weight (cost spreading is uncapped)',
    targetMinor: 100000n,
    weightsMinor: [1n, 1n],
    expectedMinor: [50000n, 50000n],
  },
  {
    name: 'zero target allocates nothing',
    targetMinor: 0n,
    weightsMinor: [1n, 2n],
    expectedMinor: [0n, 0n],
  },
];
