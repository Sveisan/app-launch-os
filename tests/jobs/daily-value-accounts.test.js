jest.mock('../../server/db/index', () => ({
  pool: { query: jest.fn() },
}))
const { pool } = require('../../server/db/index')
const { resolveMonitoredAccounts } = require('../../server/jobs/daily-value')

describe('resolveMonitoredAccounts', () => {
  beforeEach(() => { pool.query.mockReset() })

  it('unions pipeline + watchlist and dedups, pipeline winning', async () => {
    pool.query.mockResolvedValueOnce({ rows: [
      { handle: 'shared',   platform: 'instagram', source: 'pipeline',  source_ref_id: 1 },
      { handle: 'pipe-only', platform: 'tiktok',   source: 'pipeline',  source_ref_id: 2 },
    ]})
    pool.query.mockResolvedValueOnce({ rows: [
      { handle: 'shared',     platform: 'instagram', source: 'watchlist', source_ref_id: 99 },
      { handle: 'watch-only', platform: 'instagram', source: 'watchlist', source_ref_id: 7 },
    ]})

    const out = await resolveMonitoredAccounts()
    expect(out).toHaveLength(3)
    const shared = out.find(a => a.handle === 'shared')
    expect(shared.source).toBe('pipeline')
    expect(shared.source_ref_id).toBe(1)
  })

  it('only queries platforms instagram and tiktok in pipeline filter', async () => {
    pool.query.mockResolvedValue({ rows: [] })
    await resolveMonitoredAccounts()
    const sql = pool.query.mock.calls[0][0]
    expect(sql).toMatch(/pipeline_status\s+IN\s*\(\s*'discovery','researching','approved'\s*\)/)
    expect(sql).toMatch(/LOWER\(platform\)\s+IN\s*\(\s*'instagram','tiktok'\s*\)/)
  })
})
