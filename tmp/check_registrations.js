const { pool } = require('./server/db/index');

async function check() {
  try {
    const waitlist = await pool.query('SELECT COUNT(*) FROM waitlist');
    const contacts = await pool.query('SELECT COUNT(*) FROM contacts');
    
    console.log(`Waitlist count: ${waitlist.rows[0].count}`);
    console.log(`Contacts (Creators) count: ${contacts.rows[0].count}`);
    
    const latestWaitlist = await pool.query('SELECT email, created_at FROM waitlist ORDER BY created_at DESC LIMIT 5');
    console.log('\nLatest 5 on Waitlist:');
    console.table(latestWaitlist.rows);
    
    const latestContacts = await pool.query('SELECT name, handle, status, created_at FROM contacts ORDER BY created_at DESC LIMIT 5');
    console.log('\nLatest 5 Contacts:');
    console.table(latestContacts.rows);
    
    process.exit(0);
  } catch (err) {
    console.error('Error checking registrations:', err.message);
    process.exit(1);
  }
}

check();
