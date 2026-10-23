// @vitest-environment jsdom
// THROWAWAY (#1446): demonstrates the CI report step on an error raised
// outside any test. Reverted before merge.
import { expect, it } from 'vitest'

it('passes while leaving a rejection nothing handles', () => {
  void Promise.reject(new ReferenceError('window is not defined'))
  expect(true).toBe(true)
})
