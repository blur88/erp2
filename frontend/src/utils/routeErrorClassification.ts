import { isRouteErrorResponse } from 'react-router-dom'

export type RouteErrorType = 'chunk-load' | 'generic'

export interface ClassifiedError {
  type: RouteErrorType
  message: string
}

const CHUNK_LOAD_MESSAGE = 'A new version of the app is available.'
const GENERIC_FALLBACK_MESSAGE = 'An unexpected error occurred.'

const CHUNK_LOAD_PATTERNS = [
  'importing a module script failed',
  'failed to fetch dynamically imported module',
  'loading chunk',
  'chunkloaderror',
  'dynamically imported module',
]

function isChunkLoadError(error: Error): boolean {
  if (error.name === 'ChunkLoadError') {
    return true
  }

  const lowerCaseMessage = error.message.toLowerCase()
  return CHUNK_LOAD_PATTERNS.some((pattern) => lowerCaseMessage.includes(pattern))
}

export function classifyRouteError(error: unknown): ClassifiedError {
  if (isRouteErrorResponse(error)) {
    return { type: 'generic', message: GENERIC_FALLBACK_MESSAGE }
  }

  if (error instanceof Error) {
    if (isChunkLoadError(error)) {
      return { type: 'chunk-load', message: CHUNK_LOAD_MESSAGE }
    }

    return { type: 'generic', message: error.message || GENERIC_FALLBACK_MESSAGE }
  }

  if (typeof error === 'string') {
    return { type: 'generic', message: error }
  }

  return { type: 'generic', message: GENERIC_FALLBACK_MESSAGE }
}
