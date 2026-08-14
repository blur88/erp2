import { createApi } from '@reduxjs/toolkit/query/react'

import { axiosBaseQuery } from './baseQuery'

export interface RedisWindowCounter {
  /** null means fewer than two comparable readings — NOT "did not move". */
  delta: number | null
  resetObserved: boolean
}

export interface RedisInstanceWindowStats {
  instanceId: string
  sampleCount: number
  validSampleCount: number
  peakUsedBytes: number | null
  peakUtilizationPercent: number | null
  firstSampleAt: string | null
  lastSampleAt: string | null
  distinctMaxBytes: number[]
  evictedKeys: RedisWindowCounter
  oomErrors: RedisWindowCounter
}

export interface RedisMemorySample {
  at: string
  ok: boolean
  failureReason: string | null
  usedBytes: number | null
  maxBytes: number | null
  utilizationPercent: number | null
  evictedKeys: number | null
  oomErrors: number | null
  instanceId: string
}

export interface KnownInstance {
  instanceId: string
  firstSampleAt: string
  lastSampleAt: string
  sampleCount: number
  current: boolean
}

export interface RedisCounterStatus {
  available: boolean
  value: number | null
  lastDelta: number
  lastChangedAt: string | null
}

export interface RedisMemoryDetailResponse {
  samples: RedisMemorySample[]
  historyAvailable: boolean
  truncated: boolean
  totalMatching: number
  appliedInstanceFilter: 'current' | 'specific' | 'all'
  knownInstances: KnownInstance[]
  windowStats: {
    from: string | null
    to: string | null
    perInstance: RedisInstanceWindowStats[]
  }
  configuration: {
    intervalMs: number
    capacity: number
    windowSamples: number
    thresholdPercent: number
    commandTimeoutMs: number
    staleAfterMs: number
    retentionDays: number
    maxRows: number
    instanceId: string
    instanceIdSource: 'configured' | 'hostname' | 'generated'
  }
  counters: {
    oomErrors: RedisCounterStatus
    evictedKeys: RedisCounterStatus
  }
}

export interface RedisMemoryDetailQuery {
  from?: string
  to?: string
  limit?: number
  instanceId?: string
  allInstances?: boolean
}

export const redisMonitoringApiSlice = createApi({
  reducerPath: 'redisMonitoringApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['RedisMemoryDetail'],
  endpoints: (builder) => ({
    getRedisMemoryDetail: builder.query<RedisMemoryDetailResponse, RedisMemoryDetailQuery>({
      query: (params) => ({
        url: '/health/redis-memory',
        method: 'GET',
        params: (params ?? {}) as Record<string, unknown>,
      }),
      providesTags: ['RedisMemoryDetail'],
    }),
  }),
})

export const { useGetRedisMemoryDetailQuery } = redisMonitoringApiSlice
