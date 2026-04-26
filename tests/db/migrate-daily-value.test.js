const { Pool } = require('pg')

const TEST_DB = process.env.TEST_DATABASE_URL

const describeIfDb = TEST_DB ? describe : describe.skip

describeIfDb('daily-value migration', () => {
  let pool
  beforeAll(() => { pool = new Pool({ connectionString: TEST_DB }) })
  afterAll(async () => { await pool.end() })

  it('creates scout_watchlist, monitored_posts, digest_items idempotently', async () => {
    const { migrate } = require('../../server/db/migrate-runner')
    await migrate(pool)
    await migrate(pool) // second run must not throw

    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('scout_watchlist','monitored_posts','digest_items')
    `)
    expect(tables.rows.map(r => r.table_name).sort())
      .toEqual(['digest_items','monitored_posts','scout_watchlist'])
  })
})
