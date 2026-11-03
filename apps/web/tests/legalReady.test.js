import { describe, expect, it } from 'vitest'
import { problems } from '../../../scripts/check-legal-ready.mjs'

describe('legal release gate', () => {
  it('rejects drafts and placeholders', () => {
    expect(problems('x.md', '> **DRAFT for review.** hello\n[support email]')).toHaveLength(2)
    expect(problems('x.md', 'Contact [support email] or [address]')[0]).toMatch(/\[support email\] \[address\]/)
  })
  it('accepts a finished document, including normal markdown links', () => {
    expect(problems('x.md', '# Policy\nContact help@example.com. See [our site](https://example.com).')).toEqual([])
  })
})
