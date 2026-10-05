export interface RefreshKeySet {
  activeKid: string;
  secretFor(kid: string): string | undefined;
  kids(): string[];
}

export const REFRESH_KEYS = Symbol('REFRESH_KEYS');

const KID_REGEX = /^[A-Za-z0-9_-]{1,32}$/;

export function loadRefreshKeys(env: {
  JWT_REFRESH_KEYS?: string;
  JWT_REFRESH_ACTIVE_KID?: string;
  JWT_SECRET?: string;
}): RefreshKeySet {
  const rawKeys = env.JWT_REFRESH_KEYS?.trim();
  if (!rawKeys) {
    throw new Error('JWT_REFRESH_KEYS is required and cannot be empty');
  }

  const activeKid = env.JWT_REFRESH_ACTIVE_KID?.trim();
  if (!activeKid) {
    throw new Error('JWT_REFRESH_ACTIVE_KID is required and cannot be empty');
  }

  const keyMap = new Map<string, string>();
  const entries = rawKeys.split(',');

  for (const entry of entries) {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry) {
      continue;
    }

    const firstEq = trimmedEntry.indexOf('=');
    if (firstEq === -1) {
      throw new Error(`Invalid format in JWT_REFRESH_KEYS: entry missing '=' delimiter`);
    }

    const kid = trimmedEntry.slice(0, firstEq).trim();
    const secret = trimmedEntry.slice(firstEq + 1);

    if (!KID_REGEX.test(kid)) {
      throw new Error(
        `Invalid key ID '${kid}' in JWT_REFRESH_KEYS: must match ^[A-Za-z0-9_-]{1,32}$`,
      );
    }

    if (keyMap.has(kid)) {
      throw new Error(`Duplicate key ID '${kid}' in JWT_REFRESH_KEYS`);
    }

    if (secret.length < 32) {
      throw new Error(
        `Secret for key ID '${kid}' in JWT_REFRESH_KEYS is too short (minimum 32 characters)`,
      );
    }

    if (env.JWT_SECRET && secret === env.JWT_SECRET) {
      throw new Error(
        `Secret for key ID '${kid}' in JWT_REFRESH_KEYS must not equal JWT_SECRET`,
      );
    }

    keyMap.set(kid, secret);
  }

  if (keyMap.size === 0) {
    throw new Error('JWT_REFRESH_KEYS contained no valid key definitions');
  }

  if (!keyMap.has(activeKid)) {
    throw new Error(
      `JWT_REFRESH_ACTIVE_KID '${activeKid}' is not defined in JWT_REFRESH_KEYS`,
    );
  }

  const kidList = Array.from(keyMap.keys());

  return {
    activeKid,
    secretFor(kid: string): string | undefined {
      return keyMap.get(kid);
    },
    kids(): string[] {
      return [...kidList];
    },
  };
}
