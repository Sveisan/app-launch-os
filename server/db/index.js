const { Pool } = require('pg')
const config = require('../../config/app')

const pool = new Pool(config.db)

module.exports = { pool }
