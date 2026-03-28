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

const creatorRouter = require('../../server/routes/creator')

const app = express()
app.use(express.json())
app.use('/api/apply', creatorRouter)

describe('POST /api/apply', () => {
  const validBody = {
    name: 'Jane',
    email: 'jane@example.com',
    handle: '@jane',
    platform: 'instagram',
    followers: '10k-50k',
    niche: 'fitness',
    reason: 'I love breathwork',
  }

  it('returns 200 with valid body', async () => {
    const res = await request(app).post('/api/apply').send(validBody)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 400 when required field is missing', async () => {
    const { name, ...missing } = validBody
    const res = await request(app).post('/api/apply').send(missing)
    expect(res.status).toBe(400)
  })
})
