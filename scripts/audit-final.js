const { pool } = require('../server/db/index');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function similarity(s1, s2) {
    s1 = s1.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    s2 = s2.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    const tokens1 = new Set(s1.split(' ').filter(x => x.length > 3));
    const tokens2 = new Set(s2.split(' ').filter(x => x.length > 3));
    if (tokens1.size === 0 || tokens2.size === 0) return 1;
    let match = 0;
    for (const t of tokens1) {
        if (tokens2.has(t)) match++;
    }
    return match / Math.max(tokens1.size, tokens2.size);
}

async function verifyTitleOnPubmedId(id, expectedTitle) {
    try {
        const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${id}&retmode=json`;
        const res = await fetch(url);
        const data = await res.json();
        const result = data.result[id];
        if (!result) return false;
        
        const sim = similarity(result.title, expectedTitle);
        return sim > 0.4; // 40% keyword match
    } catch (e) {
        return false;
    }
}

async function verifyTitleOnDoi(doi, expectedTitle) {
    try {
        const url = `https://api.crossref.org/works/${doi}`;
        const res = await fetch(url, { headers: { "User-Agent": "BreatheApp/1.0" }});
        if (!res.ok) return false;
        const data = await res.json();
        const item = data.message;
        const title = Array.isArray(item.title) ? item.title[0] : item.title;
        if (!title) return false;
        
        const sim = similarity(title, expectedTitle);
        return sim > 0.4;
    } catch (e) {
        return false;
    }
}

async function searchCrossref(title) {
    try {
        const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(title)}&select=DOI,title,URL&rows=3`;
        const res = await fetch(url, { headers: { "User-Agent": "BreatheApp/1.0" }});
        if (!res.ok) return null;
        const data = await res.json();
        if (data.message && data.message.items && data.message.items.length > 0) {
            for (const item of data.message.items) {
                const hitTitle = Array.isArray(item.title) ? item.title[0] : item.title;
                if (hitTitle && similarity(title, hitTitle) > 0.5) return item.URL || `https://doi.org/${item.DOI}`;
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function audit() {
    const { rows } = await pool.query('SELECT slug, content_json FROM content WHERE published = true');
    let totalChecked = 0;
    let totalLegit = 0;
    let totalPurged = 0;
    
    for (const row of rows) {
        if (!row.content_json) continue;
        const data = row.content_json;
        let modified = false;
        
        if (data.research && Array.isArray(data.research)) {
            const validResearch = [];
            
            for (const study of data.research) {
                totalChecked++;
                console.log(`\n▶ Checking: "${study.title}"`);
                
                let verified = false;
                
                // 1. If it has a URL, verify the URL actually matches the title
                if (study.url) {
                    const pubmedMatch = study.url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/([0-9]+)/);
                    if (pubmedMatch) {
                        verified = await verifyTitleOnPubmedId(pubmedMatch[1], study.title);
                        if (verified) console.log(`  [OK] Valid PubMed ID matched`);
                    } else if (study.url.includes('doi.org/')) {
                        const doi = study.url.split('doi.org/')[1];
                        verified = await verifyTitleOnDoi(doi, study.title);
                        if (verified) console.log(`  [OK] Valid DOI matched`);
                    } else {
                        // Some other URL layout
                        verified = false;
                    }
                }
                
                // 2. If not verified (either no URL or URL didn't match title) -> try full search one last time
                if (!verified) {
                    console.log(`  [WARN] Needs deep search...`);
                    const resultUrl = await searchCrossref(study.title); // Deep crossref
                    if (resultUrl) {
                        study.url = resultUrl;
                        verified = true;
                        console.log(`  [RECOVERED] Found via secondary Crossref search: ${resultUrl}`);
                    }
                }
                
                if (verified) {
                    validResearch.push(study);
                    totalLegit++;
                } else {
                    console.log(`  [❌ PURGED] Absolute Hallucination.`);
                    totalPurged++;
                    modified = true;
                }
                
                await sleep(400);
            }
            
            data.research = validResearch;
        }
        
        if (modified) {
            await pool.query('UPDATE content SET content_json = $1 WHERE slug = $2', [data, row.slug]);
            console.log(`[DB] Saved clean array for row ${row.slug}`);
        }
    }
    
    console.log(`\nDone! Total Checked: ${totalChecked}. Verified & Kept: ${totalLegit}. Permanent Purged: ${totalPurged}`);
    process.exit(0);
}

audit().catch(console.error);
