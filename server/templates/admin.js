const esc = str => String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function renderAdminDashboard(stats) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Control | Breathe Collection</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #050505;
            --primary: #2C7873;
            --secondary: #52AB98;
            --accent: #E07B39;
            --text-main: #FFFFFF;
            --text-muted: #A0A0A0;
            --card-bg: rgba(255, 255, 255, 0.03);
            --card-border: rgba(255, 255, 255, 0.08);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg);
            color: var(--text-main);
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
            padding: 2rem;
        }
        .container { max-width: 1100px; margin: 0 auto; }
        header { margin-bottom: 4rem; text-align: left; }
        h1 { font-size: 2.5rem; font-weight: 300; letter-spacing: -0.02em; }
        .subtitle { color: var(--secondary); text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.8rem; margin-bottom: 0.5rem; }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1.5rem;
            margin-bottom: 4rem;
        }
        .stat-card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            padding: 2rem;
            border-radius: 20px;
            text-align: left;
            backdrop-filter: blur(10px);
        }
        .stat-value { font-size: 2.5rem; font-weight: 400; color: var(--text-main); line-height: 1; margin-bottom: 0.5rem; }
        .stat-label { color: var(--text-muted); font-size: 0.9rem; font-weight: 300; }

        .section-title { font-size: 1.5rem; font-weight: 300; margin-bottom: 2rem; border-bottom: 1px solid var(--card-border); padding-bottom: 1rem; }
        
        table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
        th { text-align: left; color: var(--secondary); font-weight: 500; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; padding: 1rem; border-bottom: 1px solid var(--card-border); }
        td { padding: 1.5rem 1rem; border-bottom: 1px solid var(--card-border); font-size: 0.95rem; vertical-align: top; }
        .handle { color: var(--text-main); font-weight: 500; text-decoration: none; }
        .handle:hover { text-decoration: underline; }
        .score { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 100px; font-size: 0.8rem; font-weight: 500; }
        .score-high { background: rgba(82, 171, 152, 0.1); color: var(--secondary); border: 1px solid rgba(82, 171, 152, 0.3); }
        .draft-text { color: var(--text-muted); font-size: 0.85rem; line-height: 1.4; max-width: 400px; }
        
        .empty-state { text-align: center; padding: 4rem; color: var(--text-muted); font-weight: 300; }
        
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="subtitle">Breathe Collection Core</div>
            <h1>Control Panel</h1>
        </header>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${stats.scoutLeads}</div>
                <div class="stat-label">Scout Findings</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.waitlistTotal}</div>
                <div class="stat-label">Waitlist Signups</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.creatorApps}</div>
                <div class="stat-label">Creator Applications</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.codesLeft}</div>
                <div class="stat-label">Available Codes</div>
            </div>
        </div>

        <h2 class="section-title">Latest Scout Intelligence</h2>
        
        <div class="card" style="background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 20px; overflow: hidden;">
            ${stats.latestLeads.length > 0 ? `
            <table>
                <thead>
                    <tr>
                        <th>Creator</th>
                        <th>Score</th>
                        <th>Niche</th>
                        <th>Draft Message</th>
                    </tr>
                </thead>
                <tbody>
                    ${stats.latestLeads.map(lead => `
                    <tr>
                        <td>
                            <a href="${esc(lead.post_url)}" target="_blank" class="handle">@${esc(lead.handle)}</a>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">${esc(lead.platform)}</div>
                        </td>
                        <td>
                            <span class="score score-high">${esc(lead.fit_score)}</span>
                        </td>
                        <td style="color: var(--text-muted); font-size: 0.85rem;">${esc(lead.niche)}</td>
                        <td class="draft-text">${esc(lead.outreach_draft)}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : `
            <div class="empty-state">No signals intercepted yet. Scout is in the field...</div>
            `}
        </div>

        <footer style="margin-top: 4rem; text-align: center; color: var(--text-muted); font-size: 0.8rem; padding-bottom: 2rem;">
            &sdot; Breathe Collection Admin &sdot; Confidential &sdot;
        </footer>
    </div>
</body>
</html>
    `;
}

module.exports = { renderAdminDashboard };
