import { AxiosError, CanceledError, type InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it } from 'vitest'

import {
  classifyCompanySettingsFailure,
  type CompanySettingsFailureCause,
} from '../companySettingsFailure'
import { SessionEndedError, StorageTimeoutError, StorageUnavailableError } from '@/session/types'

// Errors are built the way the running client builds them: an AxiosError whose
// `config` is the request this client sent (stamped, so `sentByApi` reads it as
// its own) or the refresh request's config that the response interceptor threw
// as it was, and one that never had a request at all.
const ownConfig = { __sessionRef: { sessionId: 's1', generation: 1 } } as unknown as InternalAxiosRequestConfig
const refreshConfig = {} as unknown as InternalAxiosRequestConfig

const axiosError = (
  message: string,
  code: string,
  config: unknown,
  response?: { status: number },
): AxiosError =>
  new AxiosError(
    message,
    code,
    config as InternalAxiosRequestConfig,
    null,
    response
      ? ({
          data: '',
          status: response.status,
          statusText: '',
          headers: {},
          config,
        } as never)
      : undefined,
  )

const expectCause = (error: unknown, expected: CompanySettingsFailureCause | null) =>
  expect(classifyCompanySettingsFailure(error)).toBe(expected)

describe('classifyCompanySettingsFailure', () => {
  describe('transient: the read\'s own request', () => {
    it('is a network error with no response', () => {
      expectCause(axiosError('Network Error', AxiosError.ERR_NETWORK, ownConfig), 'transient')
    })

    it('is a timeout', () => {
      expectCause(axiosError('timeout of 30000ms exceeded', AxiosError.ECONNABORTED, ownConfig), 'transient')
    })

    it.each([500, 502, 503])('is a %i', (status) => {
      expectCause(axiosError('failed', AxiosError.ERR_BAD_RESPONSE, ownConfig, { status }), 'transient')
    })
  })

  it('is a StorageTimeoutError around the request, which carries no config', () => {
    expectCause(new StorageTimeoutError('transaction timed out'), 'transient')
  })

  describe('refresh-blocked: the refresh behind a 401 failed', () => {
    it('is refused with 429', () => {
      expectCause(axiosError('429', AxiosError.ERR_BAD_REQUEST, refreshConfig, { status: 429 }), 'refresh-blocked')
    })

    it('is a network error', () => {
      expectCause(axiosError('Network Error', AxiosError.ERR_NETWORK, refreshConfig), 'refresh-blocked')
    })

    it('is a timeout', () => {
      expectCause(axiosError('timeout', AxiosError.ECONNABORTED, refreshConfig), 'refresh-blocked')
    })

    it('is a 5xx', () => {
      expectCause(axiosError('failed', AxiosError.ERR_BAD_RESPONSE, refreshConfig, { status: 503 }), 'refresh-blocked')
    })
  })

  it('is refused (own request) when the 429 retries are exhausted', () => {
    expectCause(axiosError('429', AxiosError.ERR_BAD_REQUEST, ownConfig, { status: 429 }), 'refused')
  })

  it.each([401, 403, 404])('is other (own request) on a %i', (status) => {
    expectCause(axiosError('failed', AxiosError.ERR_BAD_RESPONSE, ownConfig, { status }), 'other')
  })

  describe('is not a failure of this feature', () => {
    it('the session ended', () => {
      expectCause(new SessionEndedError('session ended before delivery'), null)
    })

    it('the request was cancelled', () => {
      expectCause(new CanceledError('canceled'), null)
    })

    it('storage is unavailable', () => {
      expectCause(new StorageUnavailableError('session storage unavailable'), null)
    })
  })

  it('is other for a plain error with no config of its own', () => {
    expectCause(new Error('x'), 'other')
  })
})