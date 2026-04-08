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

        ${!stats.isDbReady ? `
        <div style="background: rgba(224, 123, 57, 0.1); border: 1px solid var(--accent); padding: 1.5rem; border-radius: 16px; margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between;">
            <div>
                <h3 style="color: var(--accent); font-weight: 500; margin-bottom: 0.2rem;">Database Schema Outdated</h3>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0;">The Scout Agent columns are missing from your production database. This is why findings are not appearing.</p>
            </div>
            <button id="repair-btn" class="btn-primary" style="background: var(--accent); color: white; padding: 0.6rem 1.2rem; font-size: 0.8rem;">Repair Scout Database</button>
        </div>
        ` : `
        <div style="background: rgba(82, 171, 152, 0.05); border: 1px solid rgba(82, 171, 152, 0.2); padding: 1rem; border-radius: 12px; margin-bottom: 2rem; font-size: 0.8rem; color: var(--secondary); display: flex; align-items: center; gap: 0.5rem;">
            <span style="width: 8px; height: 8px; background: var(--secondary); border-radius: 50%;"></span>
            System Health: Database Schema Verified & Connected
        </div>
        `}

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
        
        <div style="margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between; background: rgba(82, 171, 152, 0.05); border: 1px dashed rgba(82, 171, 152, 0.3); padding: 1.5rem; border-radius: 16px;">
            <div>
                <h3 style="font-weight: 400; font-size: 1rem; margin-bottom: 0.2rem;">Manual Override</h3>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0;">Bypass the hourly timer and send Scout out now.</p>
            </div>
            <button id="trigger-btn" class="btn-primary" style="padding: 0.6rem 1.5rem; font-size: 0.9rem;">Trigger Sweep</button>
        </div>

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

        <h2 class="section-title" style="margin-top: 3rem;">Mission Log (Live Trace)</h2>
        <div class="card" style="background: rgba(0,0,0,0.2); border: 1px solid var(--card-border); border-radius: 12px; padding: 1.5rem; font-family: 'Courier New', monospace; font-size: 0.8rem;">
            ${stats.systemLogs.length > 0 ? stats.systemLogs.map(log => `
                <div style="margin-bottom: 0.5rem; display: flex; gap: 1rem;">
                    <span style="color: var(--text-muted); min-width: 80px;">${new Date(log.created_at).toLocaleTimeString()}</span>
                    <span style="color: var(--secondary);">${esc(log.message)}</span>
                </div>
            `).join('') : `
                <div style="color: var(--text-muted);">Initializing logs...</div>
            `}
        </div>

        <footer style="margin-top: 4rem; text-align: center; color: var(--text-muted); font-size: 0.8rem; padding-bottom: 2rem;">
            &sdot; Breathe Collection Admin &sdot; Confidential &sdot;
        </footer>
    </div>

    <script>
        const btn = document.getElementById('trigger-btn');
        const repairBtn = document.getElementById('repair-btn');

        if (repairBtn) {
            repairBtn.addEventListener('click', async () => {
                repairBtn.disabled = true;
                repairBtn.textContent = 'Repairing DB...';
                try {
                    const res = await fetch('/scout-list/repair', { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                        window.location.reload();
                    } else {
                        alert('Repair failed: ' + data.error);
                        repairBtn.disabled = false;
                        repairBtn.textContent = 'Repair Scout Database';
                    }
                } catch (err) {
                    alert('Connection failed.');
                    repairBtn.disabled = false;
                    repairBtn.textContent = 'Repair Scout Database';
                }
            });
        }

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Scout in field...';
            btn.style.opacity = '0.5';
            
            try {
                const res = await fetch('/scout-list/trigger', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    alert('Scout has been sent into the field! Give it 60 seconds to find signals, then refresh this page.');
                    btn.disabled = false;
                    btn.textContent = 'Trigger Sweep';
                    btn.style.opacity = '1';
                } else {
                    alert('Scout reported an error: ' + (data.error || 'Unknown error'));
                    btn.disabled = false;
                    btn.textContent = 'Trigger Sweep';
                    btn.style.opacity = '1';
                }
            } catch (err) {
                alert('Connection failed. Is the server running?');
                btn.disabled = false;
                btn.textContent = 'Trigger Sweep';
                btn.style.opacity = '1';
            }
        });
    </script>
</body>
</html>
    `;
}

module.exports = { renderAdminDashboard };
