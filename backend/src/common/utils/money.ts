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
