const { pool } = require('../server/db/index');

async function compare() {
    try {
        const { rows } = await pool.query("SELECT slug, title, content_json FROM content WHERE slug IN ('4-7-8-breathing', 'sleep', 'sleep-breathing')");
        
        console.log(`Found ${rows.length} rows.`);
        for (const row of rows) {
            console.log(`\n==================================`);
            console.log(`SLUG: ${row.slug}`);
            console.log(`TITLE: ${row.title}`);
            console.log(`INTRO: ${row.content_json.intro}`);
            
            console.log(`\nRESEARCH STUDIES CITED:`);
            if (row.content_json.research && row.content_json.research.length > 0) {
                row.content_json.research.forEach((r, i) => {
                    console.log(`  ${i+1}. ${r.title}`);
                });
            } else {
                console.log(`  (None)`);
            }
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
compare();
