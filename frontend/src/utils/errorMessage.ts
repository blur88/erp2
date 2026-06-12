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

/**
 * Resolve a user-facing message from an error thrown by an RTK Query mutation's
 * `.unwrap()`. The shared axiosBaseQuery returns `{ status, data: '<message>' }`,
 * where `data` is the backend message string. Falls back to legacy Axios shapes
 * and finally the provided fallback.
 */
export const rtkErrorMessage = (error: unknown, fallback: string): string => {
  const err = error as {
    data?: unknown
    response?: { data?: { message?: unknown } }
  }

  if (err?.data && typeof err.data === 'object' && 'message' in err.data) {
    const message = (err.data as { message?: unknown }).message
    if (typeof message === 'string' && message.trim().length > 0) return message
  }

  if (typeof err?.data === 'string' && err.data.trim().length > 0) return err.data

  const axiosMessage = err?.response?.data?.message
  if (typeof axiosMessage === 'string' && axiosMessage.trim().length > 0) return axiosMessage

  return fallback
}

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
