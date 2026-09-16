const SCALE = 4;

export function toMinorUnits(value: string): bigint {
  if (typeof value !== 'string') {
    throw new Error(`Money must be a decimal string, got ${typeof value}`);
  }
  const str = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Invalid money value: ${value}`);
  }
  const [intPart, fracPartRaw = ''] = str.replace('-', '').split('.');
  if (fracPartRaw.length > SCALE) {
    throw new Error(`Too many fractional digits (max ${SCALE}): ${value}`);
  }
  const frac = fracPartRaw.padEnd(SCALE, '0');
  const sign = str.startsWith('-') ? -1n : 1n;
  return sign * (BigInt(intPart) * 10n ** BigInt(SCALE) + BigInt(frac));
}

export function formatScale4(value: string | bigint): string {
  if (typeof value !== 'string' && typeof value !== 'bigint') {
    throw new Error(`Money must be a decimal string or bigint, got ${typeof value}`);
  }
  const minor = typeof value === 'bigint' ? value : toMinorUnits(value);
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const divisor = 10n ** BigInt(SCALE);
  const int = abs / divisor;
  const frac = (abs % divisor).toString().padStart(SCALE, '0');
  return `${neg ? '-' : ''}${int}.${frac}`;
}

export function sumMinor(values: string[]): bigint {
  return values.reduce((acc, v) => acc + toMinorUnits(v), 0n);
}

// Multiply two scale-4 minor-unit values → scale-4 minor-unit, round half-up.
// aMinor×bMinor is scale-8; divide by 10^4 with half-up rounding.
export function mulMinor(aMinor: bigint, bMinor: bigint): bigint {
  const scale = 10n ** BigInt(SCALE);
  const product = aMinor * bMinor;           // scale-8 magnitude
  const neg = product < 0n;
  const abs = neg ? -product : product;
  const rounded = (abs + scale / 2n) / scale; // half-up
  return neg ? -rounded : rounded;
}

/**
 * Normalize a stored scale-4 value for *display*, removing only insignificant
 * trailing zeros (`2.0000` -> `2`, `1.2500` -> `1.25`).
 *
 * Operates purely lexically on the string form. Money and quantities are stored
 * at four-decimal precision, so parsing through a JS number would risk precision
 * loss on values like `0.0001`. Input that is not a plain decimal literal is
 * passed through untouched.
 *
 * Display only — never use this to derive a value that is compared, summed, or
 * persisted. `toMinorUnits`/`formatScale4` own those paths.
 */
export function trimTrailingZeros(value: string): string {
  if (typeof value !== 'string') return value;

  const str = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) return value;
  if (!str.includes('.')) return str;

  return str.replace(/0+$/, '').replace(/\.$/, '');
}

const CENT_UNITS = 100n; // 0.01 expressed in scale-4 minor units

/**
 * Narrow a scale-4 amount to cent precision, HALF-UP away from zero (#1241).
 *
 * The unit does not change: the result is still scale-4 minor units, now
 * divisible by 100. Ties round away from zero for both signs, matching
 * mulMinor, so 1.005 -> 1.01 and -1.005 -> -1.01.
 *
 * There is no negative zero to normalize: bigint has none (-0n === 0n), so
 * quantizeToCents(-32n) is exactly 0n. The -0.00 rule lives in formatting.
 */
export function quantizeToCents(minor: bigint): bigint {
  if (typeof minor !== 'bigint') {
    throw new Error(`quantizeToCents expects bigint minor units, got ${typeof minor}`);
  }
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const rounded = ((abs + CENT_UNITS / 2n) / CENT_UNITS) * CENT_UNITS;
  return neg ? -rounded : rounded;
}

/**
 * Format a scale-4 amount for display or export: exactly two fraction digits,
 * no grouping, no currency symbol (#1241).
 *
 * Quantizes first, so a sub-cent negative residual can never surface as
 * "-0.00" — the sign flag is read from the quantized value, which is 0n.
 */
export function formatMoney(minor: bigint): string {
  const cents = quantizeToCents(minor);
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const whole = abs / 10000n;
  const frac = ((abs % 10000n) / CENT_UNITS).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

/**
 * Spread `targetMinor` across `weightsMinor` proportionally, conserving the
 * target exactly (#1241).
 *
 * Uncapped: a share may exceed its own weight, which is required for cost
 * spreading (PO shipping can exceed an item's value). Settlement allocation,
 * where a share must never exceed available capacity, is a different problem
 * and keeps using allocateByLargestRemainder.
 *
 * Residual policy is "last eligible line", NOT largest remainder: each share's
 * magnitude is truncated toward zero, then the leftover units are appended to
 * the final line. This is what #1241 asks for; largest-remainder would spread
 * the residual differently and is deliberately not used here.
 *
 * Signed targets allocate the magnitude and then apply the sign to every share,
 * so negative adjustments reconcile the same way positive ones do.
 */
export function allocate(targetMinor: bigint, weightsMinor: readonly bigint[]): bigint[] {
  for (const w of weightsMinor) {
    if (w < 0n) {
      throw new Error(`allocate: negative weight is not allowed: ${w}`);
    }
  }

  if (targetMinor === 0n) {
    return weightsMinor.map(() => 0n);
  }

  const weightTotal = weightsMinor.reduce((sum, w) => sum + w, 0n);
  if (weightTotal === 0n) {
    throw new Error('allocate: no positive weights to receive a non-zero target');
  }

  const neg = targetMinor < 0n;
  const absTarget = neg ? -targetMinor : targetMinor;

  // Truncate each magnitude, then hand every leftover unit to the last line.
  const shares = weightsMinor.map((w) => (w * absTarget) / weightTotal);
  const distributed = shares.reduce((sum, s) => sum + s, 0n);
  shares[shares.length - 1] += absTarget - distributed;

  return neg ? shares.map((s) => -s) : shares;
}

/**
 * Re-round scale-4 shares to cents so they still sum to the authoritative cent
 * total (#1241).
 *
 * Quantizing each share independently does not conserve the sum: shares of
 * 0.3350/0.3350/0.3300 total exactly 1.0000, but round to 0.34/0.34/0.33 =
 * 1.01. The drift is corrected on the last share whose sign can absorb it,
 * so no share flips sign.
 *
 * The whole drift lands on ONE share, deliberately: [0.3350, 0.3350, 0.3300]
 * reconciles to [0.34, 0.34, 0.32], not to three evenly-nudged values. That is
 * the documented "last eligible line" residual policy, and it keeps the result
 * deterministic. A reviewer seeing 0.32 beside two 0.34s is looking at intended
 * behavior, not a bug.
 */
export function reconcileToCents(
  sharesMinor: readonly bigint[],
  targetCentsMinor: bigint,
): bigint[] {
  const target = quantizeToCents(targetCentsMinor);
  const rounded = sharesMinor.map((s) => quantizeToCents(s));
  let drift = rounded.reduce((sum, s) => sum + s, 0n) - target;

  // Walk from the last share backwards, absorbing drift where the sign allows.
  for (let i = rounded.length - 1; i >= 0 && drift !== 0n; i -= 1) {
    const adjusted = rounded[i] - drift;
    const sameSign = (adjusted >= 0n && rounded[i] >= 0n) || (adjusted <= 0n && rounded[i] <= 0n);
    if (sameSign) {
      rounded[i] = adjusted;
      drift = 0n;
    }
  }

  if (drift !== 0n) {
    throw new Error(`reconcileToCents: could not absorb drift of ${drift} without flipping a sign`);
  }

  return rounded;
}
