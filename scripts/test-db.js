const { Client } = require('pg');
require('dotenv').config();

const password = 'TpBWYTbwVyXFtsQtLOBVasuwMoSOLDTo';
const variants = [
  `postgresql://postgres:${password}@localhost:5432/railway`,
  `postgresql://postgres:${password}@127.0.0.1:5432/railway`,
  `postgresql://postgres:${password}@db.railway.app:5432/railway`, // Common railway public host
];

async function testConnection() {
  for (const url of variants) {
    console.log(`Testing: ${url.replace(password, '****')}`);
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      console.log('✅ SUCCESS! Use this URL.');
      await client.end();
      process.exit(0);
    } catch (err) {
      console.log(`❌ FAILED: ${err.message}`);
    }
  }
  console.log('\nNone of the common variants worked. Checking if postgres is running locally...');
}

testConnection();
