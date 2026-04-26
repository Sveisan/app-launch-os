const { Pool } = require('pg')

const TEST_DB = process.env.TEST_DATABASE_URL

const describeIfDb = TEST_DB ? describe : describe.skip

describeIfDb('reddit-prospector migration', () => {
  let pool
  beforeAll(() => { pool = new Pool({ connectionString: TEST_DB }) })
  afterAll(async () => { await pool.end() })

  it('creates reddit_subreddits and reddit_candidates idempotently', async () => {
    const { migrate } = require('../../server/db/migrate-runner')
    await migrate(pool)
    await migrate(pool)

    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('reddit_subreddits','reddit_candidates')
    `)
    expect(tables.rows.map(r => r.table_name).sort())
      .toEqual(['reddit_candidates','reddit_subreddits'])

    const seeded = await pool.query(`SELECT COUNT(*)::int AS n FROM reddit_subreddits`)
    expect(seeded.rows[0].n).toBeGreaterThan(0)
  })
})
