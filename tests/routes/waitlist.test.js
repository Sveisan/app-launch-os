const request = require('supertest')
const express = require('express')

jest.mock('../../server/db/index', () => ({
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  },
}))

jest.mock('../../server/email/index', () => ({
  sendNotification: jest.fn().mockResolvedValue(),
}))

const waitlistRouter = require('../../server/routes/waitlist')

const app = express()
app.use(express.json())
app.use('/api/waitlist', waitlistRouter)

describe('POST /api/waitlist', () => {
  it('returns 200 with valid email', async () => {
    const res = await request(app).post('/api/waitlist').send({ email: 'user@example.com' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 400 when email is missing', async () => {
    const res = await request(app).post('/api/waitlist').send({})
    expect(res.status).toBe(400)
  })
})
