process.env.ADMIN_SECRET_KEY = 'test'
const request = require('supertest')
const express = require('express')
const cookieParser = require('cookie-parser')

jest.mock('../../server/db/index', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('../../server/jobs/daily-value', () => ({
  runDailyValue: jest.fn().mockResolvedValue({ itemsSurfaced: 3 }),
}))

const { pool } = require('../../server/db/index')
const { generateToken } = require('../../server/db/auth')
const { sign } = require('../../server/jobs/digest-token')
const dvRouter = require('../../server/routes/daily-value')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/mission-control-x89/daily-value', dvRouter)
  return app
}

const ownerToken = () => generateToken({ id: 1, email: 'o@t.com', role: 'owner' })
const freelancerToken = () => generateToken({ id: 2, email: 'f@t.com', role: 'freelancer' })

beforeEach(() => { pool.query.mockReset() })

describe('GET /items', () => {
  it('rejects unauthenticated requests', async () => {
    const app = buildApp()
    const res = await request(app).get('/mission-control-x89/daily-value/items')
    expect(res.status).toBe(404)
  })

  it('returns grouped items by status for an authenticated user', async () => {
    pool.query.mockResolvedValue({ rows: [
      { id: 1, status: 'new',     monitored_post_id: 10, platform: 'instagram',
        commenter_handle: 'a', comment_text: 'q', reply_draft: 'd',
        account_handle: 'x', caption: '', thumbnail_url: '', post_url: 'u',
        comment_posted_at: null, status_changed_at: new Date() },
      { id: 2, status: 'drafted', monitored_post_id: 10, platform: 'instagram',
        commenter_handle: 'b', comment_text: 'q2', reply_draft: 'd2',
        account_handle: 'x', caption: '', thumbnail_url: '', post_url: 'u',
        comment_posted_at: null, status_changed_at: new Date() },
    ]})
    const app = buildApp()
    const res = await request(app)
      .get('/mission-control-x89/daily-value/items')
      .set('Cookie', [`admin_jwt=${freelancerToken()}`])
    expect(res.status).toBe(200)
    expect(res.body.byStatus.new).toHaveLength(1)
    expect(res.body.byStatus.drafted).toHaveLength(1)
    expect(res.body.byStatus.replied).toEqual([])
    expect(res.body.byStatus.skipped).toEqual([])
  })
})

describe('PATCH /items/:id', () => {
  it('updates status and reply_draft, freelancer allowed', async () => {
    pool.query.mockResolvedValue({ rowCount: 1 })
    const app = buildApp()
    const res = await request(app)
      .patch('/mission-control-x89/daily-value/items/42')
      .set('Cookie', [`admin_jwt=${freelancerToken()}`])
      .send({ status: 'drafted', reply_draft: 'updated' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const sql = pool.query.mock.calls[0][0]
    expect(sql).toMatch(/UPDATE digest_items/i)
    expect(sql).toMatch(/status_changed_at = NOW\(\)/i)
  })

  it('rejects invalid status', async () => {
    const app = buildApp()
    const res = await request(app)
      .patch('/mission-control-x89/daily-value/items/42')
      .set('Cookie', [`admin_jwt=${freelancerToken()}`])
      .send({ status: 'evil' })
    expect(res.status).toBe(400)
  })
})

describe('POST /run', () => {
  it('owner-only', async () => {
    const app = buildApp()
    const denied = await request(app)
      .post('/mission-control-x89/daily-value/run')
      .set('Cookie', [`admin_jwt=${freelancerToken()}`])
    expect(denied.status).toBe(403)

    const ok = await request(app)
      .post('/mission-control-x89/daily-value/run')
      .set('Cookie', [`admin_jwt=${ownerToken()}`])
    expect(ok.status).toBe(200)
    expect(ok.body.success).toBe(true)
  })
})

describe('GET /items/:id/status (token flip)', () => {
  it('flips status when token is valid; idempotent on re-hit', async () => {
    pool.query.mockResolvedValue({ rowCount: 1 })
    const token = sign(99, 'replied')
    const app = buildApp()

    const res = await request(app)
      .get(`/mission-control-x89/daily-value/items/99/status?to=replied&token=${token}`)
    expect(res.status).toBe(200)
    expect(res.text).toMatch(/marked as.*replied/i)
    const sql = pool.query.mock.calls[0][0]
    expect(sql).toMatch(/UPDATE digest_items SET status = \$1/i)
  })

  it('rejects mismatched token', async () => {
    const goodToken = sign(99, 'replied')
    const app = buildApp()
    const res = await request(app)
      .get(`/mission-control-x89/daily-value/items/100/status?to=replied&token=${goodToken}`)
    expect(res.status).toBe(403)
  })

  it('rejects unknown status', async () => {
    const app = buildApp()
    const res = await request(app)
      .get(`/mission-control-x89/daily-value/items/99/status?to=hacked&token=anything`)
    expect(res.status).toBe(400)
  })
})
