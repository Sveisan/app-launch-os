const { pool } = require('../server/db/index');

async function viewResults() {
  console.log('\n--- 🔭 SCOUT AGENT: DATABASE AUDIT ---');

  try {
    // 1. Audit Logs
    console.log('\n[ MISSION LOG (Last 5) ]');
    const logs = await pool.query('SELECT message, created_at FROM scout_logs ORDER BY created_at DESC LIMIT 5');
    if (logs.rows.length === 0) {
      console.log('No logs found. Table might be empty or missing.');
    } else {
      logs.rows.forEach(log => {
        console.log(`[${log.created_at.toISOString().split('T')[1].split('.')[0]}] ${log.message}`);
      });
    }

    // 2. Audit Findings
    console.log('\n[ SCOUT FINDINGS ]');
    const leads = await pool.query('SELECT handle, fit_score, niche, platform FROM contacts WHERE scout_logged = TRUE');
    
    if (leads.rows.length === 0) {
      console.log('0 results found in the database.');
    } else {
      console.table(leads.rows);
    }

  } catch (err) {
    console.error('\n❌ DATABASE ERROR:', err.message);
    if (err.message.includes('does not exist')) {
      console.log('Hint: It looks like the tables/columns are missing. Run the migration or hit the "Repair" button in the UI.');
    }
  } finally {
    await pool.end();
    process.exit();
  }
}

viewResults();
