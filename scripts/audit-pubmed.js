const { pool } = require('../server/db/index');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchPubMed(title) {
    try {
        const cleanTitle = title.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, '+');
        const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${cleanTitle}[Title]&retmode=json`;
        
        const res = await fetch(url);
        if (!res.ok) return null;
        
        const data = await res.json();
        
        if (data && data.esearchresult && data.esearchresult.idlist && data.esearchresult.idlist.length > 0) {
            return `https://pubmed.ncbi.nlm.nih.gov/${data.esearchresult.idlist[0]}/`;
        }
        
        const fallbackUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${cleanTitle}&retmode=json`;
        const res2 = await fetch(fallbackUrl);
        if (!res2.ok) return null;
        const data2 = await res2.json();
        if (data2 && data2.esearchresult && data2.esearchresult.idlist && data2.esearchresult.idlist.length > 0) {
            return `https://pubmed.ncbi.nlm.nih.gov/${data2.esearchresult.idlist[0]}/`;
        }
        
        return null;
    } catch (e) {
        return null;
    }
}

async function audit() {
    const { rows } = await pool.query('SELECT slug, content_json FROM content WHERE published = true');
    let totalChecked = 0;
    let totalMismatched = 0;
    let totalFixed = 0;
    let totalRemoved = 0;
    
    for (const row of rows) {
        if (!row.content_json) continue;
        const data = row.content_json;
        let modified = false;
        
        if (data.research && Array.isArray(data.research)) {
            for (const study of data.research) {
                if (study.url && study.url.includes('pubmed.ncbi.nlm.nih.gov')) {
                    totalChecked++;
                    
                    console.log(`\n==============`);
                    console.log(`[Slug] ${row.slug}`);
                    console.log(`[Title] ${study.title}`);
                    // console.log(`[Old URL] ${study.url}`);
                    
                    const correctUrl = await searchPubMed(study.title);
                    if (correctUrl && correctUrl !== study.url.replace(/\/$/, '') + '/') {
                        console.log(`[❌ MALFORMED]`);
                        console.log(`[OLD] ${study.url}`);
                        console.log(`[NEW] ${correctUrl}`);
                        study.url = correctUrl;
                        modified = true;
                        totalMismatched++;
                        totalFixed++;
                    } else if (!correctUrl) {
                        console.log(`[❌ NOT FOUND] Could not find this paper on PubMed!`);
                        console.log(`[OLD] ${study.url}`);
                        study.url = null; // Removing hallucinatory URL
                        modified = true;
                        totalMismatched++;
                        totalRemoved++;
                    } else {
                        console.log(`[✅ CORRECT] ${study.url}`);
                    }
                    
                    await sleep(400); // respect NCBI rate limit (3 req/sec without API key)
                }
            }
        }
        
        if (modified) {
            await pool.query('UPDATE content SET content_json = $1 WHERE slug = $2', [data, row.slug]);
            console.log(`[DB] Updated row ${row.slug}`);
        }
    }
    
    console.log(`\nDone! Checked: ${totalChecked}, Mismatched: ${totalMismatched}, Fixed: ${totalFixed}, Removed: ${totalRemoved}`);
    process.exit(0);
}

audit().catch(console.error);
