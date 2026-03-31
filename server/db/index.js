const { Pool } = require('pg')
const config = require('../../config/app')

const pool = new Pool(config.db)

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message)
})

module.exports = { pool }
