const crypto = require('crypto')

const SECRET = process.env.ADMIN_SECRET_KEY || 'breathe88'
const VALID_STATUSES = new Set(['replied', 'skipped'])

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64url(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4)
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function sign(id, status) {
  const payload = `${id}.${status}`
  const mac = crypto.createHmac('sha256', SECRET).update(payload).digest()
  return `${payload}.${b64url(mac)}`
}

function verify(token) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [idStr, status, macB64] = parts
  if (!VALID_STATUSES.has(status)) return null
  const id = parseInt(idStr, 10)
  if (!Number.isInteger(id) || id <= 0) return null
  const expected = crypto.createHmac('sha256', SECRET).update(`${id}.${status}`).digest()
  let actual
  try { actual = fromB64url(macB64) } catch { return null }
  if (actual.length !== expected.length) return null
  if (!crypto.timingSafeEqual(actual, expected)) return null
  return { id, status }
}

module.exports = { sign, verify }
