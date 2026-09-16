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
