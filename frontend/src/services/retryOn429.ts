import { CanceledError, type AxiosRequestConfig, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import api from './api'
import { SessionEndedError } from '@/session/types'

// A read the ingress refused with 429 (`limit_req` in nginx.conf) is sent again
// up to `retries` times. NGINX adds no Retry-After to that 429, so in practice
// the wait is the backoff: attempt n waits between half of and all of
// min(maxDelayMs, baseDelayMs * 2^n), i.e. 250-500, 500-1000, 1000-2000 ms. A
// valid Retry-After is used instead, capped at maxDelayMs.
//
// This is for the one request named at its call site, not a general policy:
// issue #1353 tracks the limit itself.
export const RETRY_429 = { retries: 3, baseDelayMs: 500, maxDelayMs: 4000 }

const headerValue = (headers: unknown, name: string): string | undefined => {
  if (!headers || typeof headers !== 'object') return undefined
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name)
  const value = key === undefined ? undefined : (headers as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

// Retry-After as milliseconds from now: delta-seconds or an HTTP date. Anything
// else is `null`.
const retryAfterMs = (value: string | undefined): number | null => {
  if (value === undefined) return null
  const text = value.trim()
  if (/^\d+$/.test(text)) return Number(text) * 1000
  // Only a date carries letters; this keeps `Date.parse` away from '-1' or '1.5'.
  if (!/[a-z]/i.test(text)) return null
  const at = Date.parse(text)
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now())
}

const delayMs = (retryAfter: string | undefined, attempt: number, random: () => number): number => {
  const asked = retryAfterMs(retryAfter)
  if (asked !== null) return Math.min(asked, RETRY_429.maxDelayMs)
  const ceiling = Math.min(RETRY_429.maxDelayMs, RETRY_429.baseDelayMs * 2 ** attempt)
  return Math.floor(ceiling / 2 + (random() * ceiling) / 2)
}

// Resolves after `ms`, or rejects at once when `signal` aborts. Either way the
// timer and the listener are both gone when it settles.
const wait = (ms: number, signal: AbortSignal | undefined): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal!.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })

export async function requestWithRetryOn429<T = any>(
  config: AxiosRequestConfig,
  random: () => number = Math.random,
): Promise<AxiosResponse<T>> {
  const callerSignal = config.signal as AbortSignal | undefined
  let send = () => api.request<T>(config)

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await send()
    } catch (error: any) {
      const refused = error?.config as InternalAxiosRequestConfig | undefined
      if (error?.response?.status !== 429 || attempt >= RETRY_429.retries || !refused) throw error

      // The refused send's signal is the caller's combined with the session's
      // (see the request interceptor), so either one ends the wait.
      try {
        await wait(
          delayMs(headerValue(error.response.headers, 'retry-after'), attempt, random),
          refused.signal as AbortSignal | undefined,
        )
      } catch {
        if (callerSignal?.aborted) throw new CanceledError(undefined, undefined, refused)
        throw new SessionEndedError('session ended before the retry')
      }

      // Re-sending the refused config, as the 401 path does, takes the retry
      // through both interceptors again and keeps it under the session the
      // request was first sent under.
      send = () => api.request<T>(refused)
    }
  }
}
