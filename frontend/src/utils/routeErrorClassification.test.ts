import { describe, it, expect } from 'vitest'
import { UNSAFE_ErrorResponseImpl, isRouteErrorResponse } from 'react-router-dom'
import { classifyRouteError } from './routeErrorClassification'

const CHUNK_MSG = 'A new version of the app is available.'
const GENERIC_MSG = 'An unexpected error occurred.'

describe('classifyRouteError', () => {
  describe('chunk-load detection via message patterns', () => {
    it('detects "Importing a module script failed"', () => {
      expect(classifyRouteError(new Error('Importing a module script failed'))).toEqual({
        type: 'chunk-load',
        message: CHUNK_MSG,
      })
    })

    it('detects "Failed to fetch dynamically imported module"', () => {
      expect(classifyRouteError(new Error('Failed to fetch dynamically imported module'))).toEqual({
        type: 'chunk-load',
        message: CHUNK_MSG,
      })
    })

    it('detects "Loading chunk 3 failed"', () => {
      expect(classifyRouteError(new Error('Loading chunk 3 failed'))).toEqual({
        type: 'chunk-load',
        message: CHUNK_MSG,
      })
    })

    it('detects "dynamically imported module"', () => {
      expect(classifyRouteError(new Error('dynamically imported module'))).toEqual({
        type: 'chunk-load',
        message: CHUNK_MSG,
      })
    })

    it('detects error.name === "ChunkLoadError"', () => {
      const err = new Error('some webpack error')
      err.name = 'ChunkLoadError'
      expect(classifyRouteError(err)).toEqual({
        type: 'chunk-load',
        message: CHUNK_MSG,
      })
    })

    it('is case-insensitive for message patterns', () => {
      expect(classifyRouteError(new Error('IMPORTING A MODULE SCRIPT FAILED'))).toEqual({
        type: 'chunk-load',
        message: CHUNK_MSG,
      })
    })
  })

  describe('generic errors', () => {
    it('classifies a normal Error as generic', () => {
      expect(classifyRouteError(new Error('something broke'))).toEqual({
        type: 'generic',
        message: 'something broke',
      })
    })

    it('classifies a thrown string as generic', () => {
      expect(classifyRouteError('oops')).toEqual({
        type: 'generic',
        message: 'oops',
      })
    })

    it('classifies null as generic with fallback message', () => {
      expect(classifyRouteError(null)).toEqual({
        type: 'generic',
        message: GENERIC_MSG,
      })
    })

    it('classifies a React Router ErrorResponse (isRouteErrorResponse) as generic', () => {
      const routeError = new UNSAFE_ErrorResponseImpl(404, 'Not Found', { error: true }, false)
      expect(isRouteErrorResponse(routeError)).toBe(true)
      expect(classifyRouteError(routeError)).toEqual({
        type: 'generic',
        message: GENERIC_MSG,
      })
    })
  })
})
