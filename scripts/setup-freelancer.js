const { pool } = require('../server/db/index')
const { hashPassword } = require('../server/db/auth')

const PASSWORD = 'goodvibesbreath'

const USERS = [
  { email: 'support@breathecollection.app', role: 'owner' },
  { email: 'topnotchreme@gmail.com', role: 'freelancer' },
]

async function setup() {
  const hash = await hashPassword(PASSWORD)
  for (const { email, role } of USERS) {
    await pool.query(
      `INSERT INTO admin_users (email, password_hash, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = $3`,
      [email, hash, role],
    )
    console.log(`OK: ${email} (${role})`)
  }
  console.log(`\nLogin at /mission-control-x89/login with password: ${PASSWORD}`)
  await pool.end()
}

setup().catch(err => {
  console.error('Setup failed:', err)
  process.exit(1)
})
