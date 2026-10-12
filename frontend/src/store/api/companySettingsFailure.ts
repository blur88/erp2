import { CanceledError } from 'axios'

import { sentByApi } from '@/services/api'
import { SessionEndedError, StorageTimeoutError, StorageUnavailableError } from '@/session/types'

/**
 * Why a company-settings read failed, as far as recovery can tell from the raw
 * error. The class is decided here, where the error still carries the config of
 * the request it belongs to; `toQueryError` drops that, and a refresh's 429 is
 * then indistinguishable from the read's own.
 */
export type CompanySettingsFailureCause = 'transient' | 'refresh-blocked' | 'refused' | 'other'

/**
 * Order matters. The session's own errors are not failures of the read at all
 * and leave nothing to recover; a storage timeout is this read's own doing with
 * no request behind it; only then can a request be attributed, and only a
 * request this client sent is the read's own. Anything that left this client is
 * the refresh's error, thrown as it was by the response interceptor.
 */
export function classifyCompanySettingsFailure(error: unknown): CompanySettingsFailureCause | null {
  if (error instanceof SessionEndedError || error instanceof CanceledError) return null
  if (error instanceof StorageUnavailableError) return null
  if (error instanceof StorageTimeoutError) return 'transient'

  const candidate = error as { config?: unknown; response?: { status?: number } } | null
  if (candidate?.config && !sentByApi(candidate.config)) return 'refresh-blocked'

  const status = candidate?.response?.status
  if (status === 429) return 'refused'
  if (status !== undefined) return status >= 500 ? 'transient' : 'other'

  // No response: a network error or a timeout, for the read's own request.
  return candidate?.config ? 'transient' : 'other'
}