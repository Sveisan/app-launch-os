const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db/index');

async function importLeads() {
  console.log('🚀 Starting Import from docs/scout_finds.md...');
  
  const filePath = path.join(__dirname, '../docs/scout_finds.md');
  if (!fs.existsSync(filePath)) {
    console.error('❌ Error: docs/scout_finds.md not found.');
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  let importedCount = 0;
  let skipCount = 0;

  for (const line of lines) {
    if (!line.trim() || !line.includes('|') || line.includes('Handle | Platform')) continue;
    if (line.includes('---|---')) continue;

    const parts = line.split('|').map(p => p.trim()).filter(p => p !== '');
    if (parts.length < 4) continue;

    const handle = parts[0].replace('@', '');
    const platform = parts[1];
    const score = parseFloat(parts[2]);
    const niche = parts[3];
    const draft = parts[4] || '';

    try {
      // Check if already exists to avoid duplicates
      const exists = await pool.query('SELECT id FROM contacts WHERE handle = $1 AND platform = $2', [handle, platform]);
      
      if (exists.rows.length === 0) {
        await pool.query(`
          INSERT INTO contacts (handle, platform, fit_score, niche, outreach_draft, status, scout_logged)
          VALUES ($1, $2, $3, $4, $5, 'trial', TRUE)
        `, [handle, platform, score, niche, draft]);
        importedCount++;
      } else {
        skipCount++;
      }
    } catch (err) {
      console.error(`❌ Failed to import @${handle}:`, err);
    }
  }

  console.log(`\n✅ Import Complete!`);
  console.log(`📥 New Leads: ${importedCount}`);
  console.log(`♻️ Duplicates skipped: ${skipCount}`);
  
  await pool.end();
}

importLeads().catch(err => {
  console.error('CRITICAL ERROR:', err);
  process.exit(1);
});
