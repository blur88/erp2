export const getErrorMessage = (error: unknown, fallback: string): string => {
  const value = extractMessageValue(error);

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (Array.isArray(value)) {
    const combined = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .join(', ');
    return combined.length > 0 ? combined : fallback;
  }

  return fallback;
};

const extractMessageValue = (error: unknown): unknown => {
  if (!error || typeof error !== 'object') {
    return error;
  }

  const candidate = error as {
    response?: { data?: { message?: unknown } };
    message?: unknown;
  };

  return candidate.response?.data?.message ?? candidate.message ?? error;
};
