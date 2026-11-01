import { SESSION_IDLE_TIMEOUT } from './coordinator'

export function resolveIdleTimeout(environment?: { SESSION_IDLE_TIMEOUT_MS?: unknown }): number {
  const configured = Number(environment?.SESSION_IDLE_TIMEOUT_MS)
  return Number.isFinite(configured) && configured > 0 ? configured : SESSION_IDLE_TIMEOUT
}
