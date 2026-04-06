const { pool } = require('../server/db/index');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Compute a simple string similarity (Levenshtein based or token based)
function similarity(s1, s2) {
    s1 = s1.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    s2 = s2.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    const tokens1 = new Set(s1.split(' ').filter(x => x.length > 2));
    const tokens2 = new Set(s2.split(' ').filter(x => x.length > 2));
    let match = 0;
    for (const t of tokens1) {
        if (tokens2.has(t)) match++;
    }
    return match / Math.max(tokens1.size, tokens2.size);
}

async function searchCrossref(study) {
    try {
        const query = encodeURIComponent(study.title + " " + study.authors);
        const url = `https://api.crossref.org/works?query.bibliographic=${query}&select=DOI,title,URL,author&rows=3`;
        
        const res = await fetch(url, { headers: { "User-Agent": "BreatheAppContentAudit/1.0 (mailto:admin@breathecollection.app)" }});
        if (!res.ok) return null;
        
        const data = await res.json();
        if (data.message && data.message.items && data.message.items.length > 0) {
            const bestHit = data.message.items[0];
            const hitTitle = Array.isArray(bestHit.title) ? bestHit.title[0] : bestHit.title;
            
            // Check if it's actually similar
            if (hitTitle && similarity(study.title, hitTitle) > 0.5) {
                return bestHit.URL || `https://doi.org/${bestHit.DOI}`;
            }
        }
        return null; // Not found or poorly matched
    } catch (e) {
        return null;
    }
}

async function audit() {
    const { rows } = await pool.query('SELECT slug, content_json FROM content WHERE published = true');
    let totalChecked = 0;
    let totalRecovered = 0;
    let totalDeleted = 0;
    
    for (const row of rows) {
        if (!row.content_json) continue;
        const data = row.content_json;
        let modified = false;
        
        if (data.research && Array.isArray(data.research)) {
            const validResearch = [];
            
            for (const study of data.research) {
                // If it already has a URL, it passed the previous PubMed audit
                if (study.url) {
                    validResearch.push(study);
                    continue;
                }
                
                totalChecked++;
                console.log(`\n==============`);
                console.log(`[Checking] ${study.title}`);
                
                const recoveredUrl = await searchCrossref(study);
                if (recoveredUrl) {
                    console.log(`[✅ RECOVERED] ${recoveredUrl}`);
                    study.url = recoveredUrl;
                    validResearch.push(study);
                    totalRecovered++;
                    modified = true;
                } else {
                    console.log(`[❌ HALLUCINATION PURGED] No trace on Crossref.`);
                    // We DO NOT push to validResearch, effectively deleting it
                    totalDeleted++;
                    modified = true;
                }
                
                await sleep(500);
            }
            
            data.research = validResearch;
        }
        
        if (modified) {
            await pool.query('UPDATE content SET content_json = $1 WHERE slug = $2', [data, row.slug]);
            console.log(`[DB] Updated row ${row.slug}`);
        }
    }
    
    console.log(`\nDone! Checked missing: ${totalChecked}, Recovered: ${totalRecovered}, Purged completely: ${totalDeleted}`);
    process.exit(0);
}

audit().catch(console.error);
