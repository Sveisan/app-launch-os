process.env.ADMIN_SECRET_KEY = 'test-secret'
const { sign, verify } = require('../../server/jobs/digest-token')

describe('digest-token', () => {
  it('round-trips item id + status', () => {
    const t = sign(42, 'replied')
    expect(verify(t)).toEqual({ id: 42, status: 'replied' })
  })

  it('rejects a tampered token', () => {
    const t = sign(42, 'replied')
    const tampered = t.slice(0, -2) + (t.slice(-2) === 'aa' ? 'bb' : 'aa')
    expect(verify(tampered)).toBeNull()
  })

  it('rejects garbage', () => {
    expect(verify('not-a-token')).toBeNull()
    expect(verify('')).toBeNull()
  })

  it('produces different tokens for different (id, status)', () => {
    expect(sign(1, 'replied')).not.toBe(sign(2, 'replied'))
    expect(sign(1, 'replied')).not.toBe(sign(1, 'skipped'))
  })
})
