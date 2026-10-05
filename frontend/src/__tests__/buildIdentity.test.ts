import { describe, it, expect } from 'vitest'
import { writeBuildSha } from '@/config/buildSha'

describe('build identity', () => {
  it('writes the SHA into the erp-build meta tag', () => {
    const html = '<head>\n  <meta name="erp-build" content="unknown" />\n</head>'
    expect(writeBuildSha(html, 'abc123')).toContain('<meta name="erp-build" content="abc123" />')
  })

  it('writes unknown when the variable is unset', () => {
    const html = '<head>\n  <meta name="erp-build" content="stale" />\n</head>'
    expect(writeBuildSha(html, undefined)).toContain('content="unknown"')
  })

  it('inserts the tag when the template has none', () => {
    const html = '<head>\n</head>'
    expect(writeBuildSha(html, 'deadbeef')).toContain('<meta name="erp-build" content="deadbeef" />')
  })
})
