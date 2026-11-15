import { describe, expect, it } from 'vitest'
import { resolveAppVersion } from '../app-version'

describe('build version', () => {
  it('uses the release version ahead of the package version', () => {
    expect(resolveAppVersion({ VITE_APP_VERSION: '3.17.1', npm_package_version: '0.0.0-development' })).toBe('3.17.1')
  })
  it('uses the development package version when Docker supplies an empty build argument', () => {
    expect(resolveAppVersion({ VITE_APP_VERSION: '', npm_package_version: '0.0.0-development' })).toBe('0.0.0-development')
  })
  it('uses the development package version for local builds', () => {
    expect(resolveAppVersion({ npm_package_version: '0.0.0-development' })).toBe('0.0.0-development')
  })
})
