const esc = str => String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function renderAdminDashboard(stats, userRole = 'owner') {
    const isOwner = userRole === 'owner';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
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
        
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        
        .kanban-card { transition: transform 0.2s, background 0.2s; cursor: grab; }
        .kanban-card:hover { transform: translateY(-2px); background: rgba(255, 255, 255, 0.05) !important; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        .kanban-card:active { cursor: grabbing; }
        .drag-over { background: rgba(82, 171, 152, 0.1) !important; border-color: var(--secondary) !important; }
    </style>
</head>
<body>
    <div class="container">
        <header style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
                <div class="subtitle">Breathe Collection Core</div>
                <h1>Control Panel</h1>
            </div>
            <a href="/mission-control-x89/manual" style="background: rgba(82, 171, 152, 0.1); color: var(--secondary); border: 1px solid rgba(82, 171, 152, 0.3); padding: 0.8rem 1.5rem; border-radius: 12px; font-size: 0.9rem; text-decoration: none; font-weight: 500; display: flex; align-items: center; gap: 0.5rem; transition: background 0.2s;">
                Guide & Safety 📖
            </a>
        </header>

        ${isOwner && !stats.isDbReady ? `
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

        <h2 class="section-title">Video Studio (TikTok Pipeline)</h2>
        <div class="card" style="background: var(--card-bg); border: 1px solid var(--card-border); padding: 2rem; border-radius: 20px; margin-bottom: 3rem;">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 2rem;">
                <div>
                    <h3 style="font-weight: 400; font-size: 1.2rem; margin-bottom: 0.5rem;">Automated Batch Production</h3>
                    <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 500px;">Generate 6 research-backed TikTok videos (9:16) with Ultra-Glass aesthetics and Liam voiceover. Total production time is ~3-4 minutes.</p>
                </div>
                ${isOwner ? `
                <div style="display: flex; gap: 10px;">
                    <button id="clearCacheBtn" class="btn" style="background: transparent; border: 1px solid var(--card-border); opacity: 0.6;">Clear Cache</button>
                    <button id="generateVideosBtn" class="btn-primary" style="background: var(--primary); color: white; border: none; padding: 0.8rem 1.5rem; border-radius: 12px; font-size: 0.9rem; font-weight: 500; cursor: pointer;">● Generate 6 TikTok Videos</button>
                </div>
                ` : '<div style="font-size: 0.75rem; color: var(--accent); border: 1px solid var(--accent); padding: 0.5rem 1rem; border-radius: 8px;">Reader Access Only</div>'}
            </div>

            <div id="videoProgressGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                <!-- Filled via JS -->
                <div class="empty-state" style="grid-column: 1/-1; padding: 2rem; border: 1px dashed var(--card-border); border-radius: 12px;">No active production. Click generate to start.</div>
            </div>
        </div>

        <h2 class="section-title">Influencer Pipeline</h2>
        
        ${isOwner ? `
        <div style="margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between; background: rgba(82, 171, 152, 0.05); border: 1px dashed rgba(82, 171, 152, 0.3); padding: 1.5rem; border-radius: 16px;">
            <div>
                <h3 style="font-weight: 400; font-size: 1rem; margin-bottom: 0.2rem;">Manual Override</h3>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0;">Bypass the hourly timer and send Scout out now.</p>
            </div>
            <div>
                <button id="triggerSweep" class="btn" style="background: rgba(255,255,255,0.1); border: 1px solid var(--card-border); color: white; padding: 0.6rem 1.5rem; font-size: 0.9rem; border-radius: 8px; cursor: pointer;">Trigger Sweep</button>
                <button id="testMission" class="btn" style="padding: 0.6rem 1.5rem; font-size: 0.9rem; background: rgba(46, 213, 115, 0.1); color: #2ed573; border: 1px solid #2ed573; margin-left: 10px; border-radius: 8px; cursor: pointer;">Run Test Mission</button>
            </div>
        </div>
        ` : ''}

        <div style="margin-bottom: 1.5rem; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
            <span style="font-size: 0.8rem; color: var(--text-muted);">Filters:</span>
            
            <select id="platformFilter" onchange="applyFilters()" style="background: rgba(255,255,255,0.05); color: white; border: 1px solid var(--card-border); border-radius: 8px; padding: 0.4rem 1rem; font-size: 0.85rem; outline: none; cursor: pointer;">
                <option value="all">All Platforms</option>
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram</option>
            </select>

            <select id="langFilter" onchange="applyFilters()" style="background: rgba(255,255,255,0.05); color: white; border: 1px solid var(--card-border); border-radius: 8px; padding: 0.4rem 1rem; font-size: 0.85rem; outline: none; cursor: pointer;">
                <option value="all">All Languages</option>
                <option value="en">English (Global)</option>
                <option value="no">Nordic (NO)</option>
                <option value="es">Spanish/Port</option>
            </select>
        </div>

        <div class="kanban-board" style="display: flex; gap: 1.5rem; overflow-x: auto; padding-bottom: 2rem;">
            ${['discovery', 'researching', 'approved', 'outreach_sent', 'rejected'].map(status => {
                const title = {
                    'discovery': 'Discovery',
                    'researching': 'Researching',
                    'approved': 'Approved',
                    'outreach_sent': 'Outreach Sent',
                    'rejected': 'Archive'
                }[status];
                
                const leads = stats.pipelineStatus[status] || [];
                
                return `
                <div class="kanban-column" ondrop="drop(event, '${status}')" ondragover="allowDrop(event)" ondragenter="dragEnter(event)" ondragleave="dragLeave(event)" style="flex: 0 0 320px; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 16px; padding: 1.5rem; display: flex; flex-direction: column; max-height: 800px; transition: all 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h4 style="font-weight: 500; font-size: 1rem; text-transform: capitalize;">${title}</h4>
                        <span class="col-count" style="background: rgba(255,255,255,0.1); padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem;">${leads.length}</span>
                    </div>
                    
                    <div class="kanban-cards" style="overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 1rem; padding-right: 0.5rem;" data-status="${status}">
                        ${leads.length === 0 ? `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 2rem 0; pointer-events: none;">Empty</div>` : leads.map(lead => {
                            
                            // Determine prev and next columns
                            const cols = ['discovery', 'researching', 'approved', 'outreach_sent'];
                            const idx = cols.indexOf(status);
                            const prevStatus = idx > 0 ? cols[idx - 1] : null;
                            const nextStatus = idx >= 0 && idx < cols.length - 1 ? cols[idx + 1] : null;
                            
                            // Determine language
                            const noTags = ['pust', 'pusteteknikk', 'stressmestring', 'biohackingnorge'];
                            const esTags = ['respiracion', 'meditacion', 'bienestar', 'respiracao', 'bemestar', 'saudemental', 'ansiedade', 'estresse', 'saludmental'];
                            const nicheLower = (lead.niche || '').toLowerCase();
                            let lang = 'en';
                            if (noTags.includes(nicheLower)) lang = 'no';
                            else if (esTags.includes(nicheLower)) lang = 'es';

                            return `
                            <!-- Card -->
                            <div class="kanban-card" draggable="true" ondragstart="drag(event, ${lead.id})" data-id="${lead.id}" data-platform="${esc(lead.platform)}" data-lang="${lang}" data-lead="${encodeURIComponent(JSON.stringify(lead))}" onclick="openModal(this.getAttribute('data-lead'))" style="background: var(--bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 1rem; position: relative;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                                    <span class="score score-high">${esc(lead.fit_score)}</span>
                                    <div class="kanban-actions" style="display: flex; gap: 0.5rem; margin-top: -5px; padding-bottom: 5px;">
                                        ${status !== 'rejected' ? `<button onclick="updateStatus(${lead.id}, 'rejected', event)" title="Reject" style="background:none; border:none; color: rgba(255, 71, 87, 0.5); cursor:pointer; font-size: 1.2rem; line-height: 1;">✕</button>` : ''}
                                        ${prevStatus ? `<button onclick="updateStatus(${lead.id}, '${prevStatus}', event)" title="Move Back" style="background:none; border:none; color: var(--secondary); cursor:pointer; font-size: 1.2rem; line-height: 1;">←</button>` : ''}
                                        ${nextStatus ? `<button onclick="updateStatus(${lead.id}, '${nextStatus}', event)" title="Move Forward" style="background:none; border:none; color: var(--secondary); cursor:pointer; font-size: 1.2rem; line-height: 1;">→</button>` : ''}
                                    </div>
                                </div>
                                <div style="font-weight: 500; font-size: 0.95rem; margin-bottom: 0.2rem; color: white;">@${esc(lead.handle)}</div>
                                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.2rem;">${esc(lead.platform)} &middot; ${esc(lead.niche)}</div>
                            </div>
                            `
                        }).join('')}
                    </div>
                </div>
                `;
            }).join('')}
        </div>

        <!-- Details Modal -->
        <div id="leadModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(5px); z-index: 1000; align-items: center; justify-content: center;">
            <div style="background: var(--bg); border: 1px solid var(--card-border); border-radius: 20px; width: 90%; max-width: 650px; max-height: 90vh; overflow-y: auto; padding: 2.5rem; position: relative;">
                <button onclick="closeModal()" style="position: absolute; top: 1.5rem; right: 1.5rem; background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); border-radius: 50%; color: white; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; cursor: pointer; transition: background 0.2s;">&times;</button>
                
                <div style="display: flex; gap: 1.5rem; align-items: flex-start; margin-bottom: 2rem; padding-bottom: 2rem; border-bottom: 1px solid var(--card-border);">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.8rem;">
                        <span id="modalScore" class="score score-high" style="font-size: 1.5rem; padding: 0.6rem 1.2rem; background: rgba(82, 171, 152, 0.1); border: 1px solid var(--secondary); color: var(--secondary);"></span>
                        <a id="modalLink" href="#" target="_blank" style="color: var(--secondary); font-size: 0.8rem; text-decoration: none; display: flex; align-items: center; gap: 0.3rem; background: rgba(255,255,255,0.05); padding: 0.3rem 0.6rem; border-radius: 6px;">
                            Profile ↗
                        </a>
                    </div>
                    <div style="flex: 1;">
                        <h2 id="modalHandle" style="font-weight: 400; font-size: 1.8rem; margin: 0 0 0.5rem 0; color: white;"></h2>
                        <div style="display: flex; gap: 1rem; color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem; background: rgba(0,0,0,0.3); padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid var(--card-border); width: fit-content;">
                            <span id="modalPlatform" style="color: var(--accent); font-weight: 500;"></span>
                            <span style="border-left: 1px solid var(--card-border); padding-left: 1rem;"><strong id="modalFollowers" style="color: white; font-weight: 500;"></strong> followers</span>
                            <span style="border-left: 1px solid var(--card-border); padding-left: 1rem;"><strong id="modalER" style="color: white; font-weight: 500;"></strong>% ER</span>
                        </div>
                        <p id="modalBio" style="font-size: 0.95rem; line-height: 1.5; color: var(--text-muted); margin: 0;"></p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem;">
                    <div style="background: rgba(82, 171, 152, 0.05); border: 1px solid rgba(82, 171, 152, 0.2); padding: 1.5rem; border-radius: 12px;">
                        <h4 style="font-weight: 500; color: var(--secondary); font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.5rem; letter-spacing: 0.05em;">Scout Reason</h4>
                        <p id="modalFeedback" style="font-size: 0.95rem; line-height: 1.5; color: white; margin: 0;"></p>
                    </div>
                    <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--card-border); padding: 1.5rem; border-radius: 12px;">
                        <h4 style="font-weight: 500; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.5rem; letter-spacing: 0.05em;">Found Keyword</h4>
                        <p id="modalNiche" style="font-size: 0.95rem; line-height: 1.5; color: white; margin: 0;"></p>
                    </div>
                </div>

                <div style="background: var(--bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden;">
                    <div style="background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--card-border); padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                        <h4 style="font-weight: 500; color: var(--accent); font-size: 0.8rem; text-transform: uppercase; margin: 0; letter-spacing: 0.05em;">AI Outreach Draft</h4>
                        <button onclick="copyDraft()" style="background: rgba(255,255,255,0.1); border: 1px solid var(--card-border); color: white; padding: 0.4rem 1rem; border-radius: 6px; font-size: 0.75rem; cursor: pointer; transition: background 0.2s;">Copy to Clipboard</button>
                    </div>
                    <div style="position: relative;">
                        <textarea id="modalDraft" style="width: 100%; height: 200px; background: transparent; border: none; color: var(--text-main); font-family: inherit; font-size: 1rem; line-height: 1.6; padding: 1.5rem; resize: vertical; outline: none;" readonly></textarea>
                    </div>
                </div>

                <div id="promoSection" style="margin-top: 2rem; background: rgba(224, 123, 57, 0.05); border: 1px dashed rgba(224, 123, 57, 0.3); padding: 1.5rem; border-radius: 16px; display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <h4 style="font-weight: 500; color: var(--accent); font-size: 0.9rem; margin-bottom: 0.2rem;">Promo Code for Creator</h4>
                        <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">Generate a unique onboarding code for this lead.</p>
                    </div>
                    <div id="promoContainer">
                        <button id="claimCodeBtn" onclick="claimCode()" style="background: var(--accent); color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 8px; font-size: 0.85rem; font-weight: 500; cursor: pointer;">Claim Code</button>
                    </div>
                </div>
            </div>
        </div>

        ${isOwner ? `
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
        ` : ''}

        <footer style="margin-top: 4rem; text-align: center; color: rgba(255,255,255,0.3); font-size: 0.7rem; letter-spacing: 0.05em; text-transform: uppercase;">
    &middot; Breathe Collection Admin &middot; Confidential &middot; <a href="#" onclick="logout()" style="color: var(--accent); text-decoration: underline;">Logout</a> &middot;
</footer>
    </div>

    <script>
        async function logout() {
            if (!confirm('Logout?')) return;
            const res = await fetch('/mission-control-x89/logout', { method: 'POST' });
            if (res.ok) window.location.href = '/mission-control-x89/login';
        }

        const btn = document.getElementById('triggerSweep');
        const repairBtn = document.getElementById('repair-btn');


        if (repairBtn) {
            repairBtn.addEventListener('click', async () => {
                repairBtn.disabled = true;
                repairBtn.textContent = 'Repairing DB...';
                try {
                    const res = await fetch('/mission-control-x89/repair?auth=breathe88', { method: 'POST' });
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
            btn.textContent = 'Scouting Fields...';
            btn.style.opacity = '0.5';
            
            try {
                const res = await fetch('/mission-control-x89/trigger?auth=breathe88', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    const status = document.createElement('div');
                    status.style.cssText = 'color: var(--secondary); font-size: 0.8rem; margin-top: 1rem; text-align: center; animation: fadeIn 0.5s ease;';
                    status.innerHTML = '✔ Scout is in the field. Findings will appear in the Mission Log below shortly.';
                    btn.parentNode.parentNode.appendChild(status);
                    setTimeout(() => status.remove(), 5000);
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

        // Kanban Interactive Functions
        const modal = document.getElementById('leadModal');
        
        function openModal(leadStr) {
            const lead = JSON.parse(decodeURIComponent(leadStr));
            currentHandle = lead.handle;
            document.getElementById('modalScore').textContent = lead.fit_score;
            document.getElementById('modalHandle').textContent = '@' + lead.handle;
            
            // Build fallback URL if post_url is missing
            let profileUrl = lead.post_url;
            if (!profileUrl) {
                const cleanHandle = lead.handle.replace('@', '');
                profileUrl = lead.platform && lead.platform.toLowerCase() === 'tiktok' 
                    ? 'https://tiktok.com/@' + cleanHandle 
                    : 'https://instagram.com/' + cleanHandle;
            }
            document.getElementById('modalLink').href = profileUrl;
            
            document.getElementById('modalFollowers').textContent = (lead.followers_count || lead.followers || 0).toLocaleString();
            document.getElementById('modalER').textContent = (lead.engagement_rate || 0).toFixed(1);
            document.getElementById('modalNiche').textContent = '#' + (lead.niche || 'unknown');
            document.getElementById('modalPlatform').textContent = lead.platform;
            
            const contentFound = lead.bio || lead.post_caption;
            if (contentFound) {
                document.getElementById('modalBio').textContent = contentFound;
                document.getElementById('modalBio').style.fontStyle = 'normal';
                document.getElementById('modalBio').style.color = 'var(--text-muted)';
            } else {
                document.getElementById('modalBio').textContent = '⚠️ Profile summary not stored for this older lead. Please use the "Profile ↗" button above to evaluate them manually.';
                document.getElementById('modalBio').style.fontStyle = 'italic';
                document.getElementById('modalBio').style.color = 'rgba(255,255,255,0.4)';
            }
            
            document.getElementById('modalDraft').value = lead.outreach_draft || 'No draft generated.';
            document.getElementById('modalFeedback').textContent = lead.reason || lead.fit_feedback || 'No specific feedback provided by Scout.';
            modal.style.display = 'flex';
        }
        
        function closeModal() {
            modal.style.display = 'none';
        }
        
        function copyDraft() {
            const copyText = document.getElementById('modalDraft');
            copyText.select();
            copyText.setSelectionRange(0, 99999);
            navigator.clipboard.writeText(copyText.value);
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = originalText, 2000);
        }

        let currentHandle = '';

        async function claimCode() {
            const btn = document.getElementById('claimCodeBtn');
            btn.disabled = true;
            btn.textContent = 'Claiming...';
            
            try {
                const res = await fetch('/mission-control-x89/claim-code?auth=breathe88', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ handle: currentHandle })
                });
                const data = await res.json();
                if (data.success) {
                    showCode(data.code);
                } else {
                    alert('Error: ' + data.error);
                    btn.disabled = false;
                    btn.textContent = 'Claim Code';
                }
            } catch (err) {
                alert('Connection failed');
                btn.disabled = false;
                btn.textContent = 'Claim Code';
            }
        }

        function showCode(code) {
            const container = document.getElementById('promoContainer');
            container.innerHTML = `
                <div style="display: flex; gap: 0.5rem; align-items: center; background: rgba(0,0,0,0.3); padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid var(--accent);">
                    <code style="color: var(--accent); font-weight: 600; font-size: 1rem;">${code}</code>
                    <button onclick="copyToClipboard('${code}')" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.8rem;">Copy</button>
                </div>
            `;
        }

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text);
            alert('Code copied: ' + text);
        }
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        async function updateStatus(id, newStatus, event) {
            if (event) event.stopPropagation();
            try {
                const res = await fetch('/mission-control-x89/update-status?auth=breathe88', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, status: newStatus })
                });
                const data = await res.json();
                if (data.success) {
                    location.reload(); 
                } else {
                    alert('Error updating status: ' + data.error);
                }
            } catch(e) {
                alert('Update failed.');
            }
        }
        
        // --- Drag and Drop Logic --- //
        function allowDrop(ev) {
            ev.preventDefault();
        }

        function dragEnter(ev) {
            ev.preventDefault();
            ev.currentTarget.classList.add('drag-over');
        }

        function dragLeave(ev) {
            ev.currentTarget.classList.remove('drag-over');
        }

        function drag(ev, id) {
            ev.dataTransfer.setData("text/plain", id);
            // Optional: Set a drag image or opacity
            ev.target.style.opacity = '0.5';
        }

        async function drop(ev, newStatus) {
            ev.preventDefault();
            ev.currentTarget.classList.remove('drag-over');
            const id = ev.dataTransfer.getData("text/plain");
            if(id) {
               await updateStatus(id, newStatus, null);
            }
            // Reset opacity via reload
        }
        document.addEventListener('dragend', (ev) => {
             if (ev.target.classList && ev.target.classList.contains('kanban-card')) {
                 ev.target.style.opacity = '1';
             }
        });

        // Test Mission
        document.getElementById('testMission').addEventListener('click', async () => {
            const btn = document.getElementById('testMission');
            btn.textContent = 'Generating...';
            btn.style.opacity = '0.5';
            
            try {
                const res = await fetch('/mission-control-x89/test-seed?auth=breathe88', {
                    method: 'POST'
                });
                const data = await res.json();
                if (data.success) {
                    alert('Mock Lead Generated! Refreshing dashboard...');
                    window.location.reload();
                } else {
                    alert('Error: ' + data.error);
                }
            } catch (err) {
                alert('Test Failed: ' + err.message);
            } finally {
                btn.textContent = 'Run Test Mission';
                btn.style.opacity = '1';
            }
        });

        // Video Studio Logic
        const videoBtn = document.getElementById('generateVideosBtn');
        const clearBtn = document.getElementById('clearCacheBtn');
        const progressGrid = document.getElementById('videoProgressGrid');
        let pollingInterval = null;

        const techniques = ['box', 'huberman', 'seal', 'sleep', 'calm', '4-7-8'];
        const techLabels = {
            'box': 'Box Breathing',
            'huberman': 'Huberman Sigh',
            'seal': 'SEAL Tactical',
            'sleep': 'Sleep Protocol',
            'calm': 'Coherent/HRV',
            '4-7-8': '4-7-8 Relax'
        };

        function renderProgress(job) {
            progressGrid.innerHTML = techniques.map(tech => {
                const phase = job.progress[tech] || 'Queued';
                let statusColor = 'var(--text-muted)';
                let isDone = phase === 'Done';
                let isError = phase.startsWith('Error');
                
                if (isDone) statusColor = 'var(--secondary)';
                if (isError) statusColor = '#ff4757';
                if (!isDone && !isError && phase !== 'Queued') statusColor = 'var(--primary)';

                return \`
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); padding: 1.2rem; border-radius: 12px; display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <div style="font-size: 0.85rem; font-weight: 500;">\${techLabels[tech]}</div>
                            <div style="font-size: 0.75rem; color: \${statusColor}; margin-top: 2px;">\${phase}</div>
                        </div>
                        \${isDone ? \`
                            <a href="/api/video-studio/download/\${tech}.mp4?auth=breathe88" class="handle" style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em;">↓ Download</a>
                        \` : ''}
                    </div>
                \`;
            }).join('');
        }

        async function pollStatus(jobId) {
            const res = await fetch(\`/api/video-studio/status/\${jobId}?auth=breathe88\`);
            const job = await res.json();
            renderProgress(job);

            if (job.status === 'completed' || job.status === 'error') {
                clearInterval(pollingInterval);
                videoBtn.disabled = false;
                videoBtn.textContent = '● Generate 6 TikTok Videos';
                videoBtn.style.opacity = '1';
            }
        }

        videoBtn.addEventListener('click', async () => {
            if (!confirm('Start video production? This will consume Claude and ElevenLabs credits.')) return;
            
            videoBtn.disabled = true;
            videoBtn.textContent = 'Initializing Batch...';
            videoBtn.style.opacity = '0.5';

            try {
                const res = await fetch('/api/video-studio/generate?auth=breathe88', { method: 'POST' });
                const data = await res.json();
                
                if (data.success) {
                    if (pollingInterval) clearInterval(pollingInterval);
                    pollingInterval = setInterval(() => pollStatus(data.jobId), 2000);
                    pollStatus(data.jobId);
                } else {
                    alert('Failed to start: ' + data.error);
                    videoBtn.disabled = false;
                }
            } catch (err) {
                alert('Connection failed');
                videoBtn.disabled = false;
            }
        });

        clearBtn.addEventListener('click', async () => {
            if (!confirm('Clear all generated videos?')) return;
            const res = await fetch('/api/video-studio/clear-cache?auth=breathe88', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                alert('Cache cleared.');
                location.reload();
            }
        });

        // Filter Logic
        function applyFilters() {
            const platform = document.getElementById('platformFilter').value.toLowerCase();
            const lang = document.getElementById('langFilter').value.toLowerCase();

            document.querySelectorAll('.kanban-column').forEach(col => {
                const cards = col.querySelectorAll('.kanban-card');
                let visibleCount = 0;
                cards.forEach(card => {
                    const cardPlatform = (card.getAttribute('data-platform') || '').toLowerCase();
                    const cardLang = (card.getAttribute('data-lang') || '').toLowerCase();
                    
                    const matchPlatform = platform === 'all' || cardPlatform === platform;
                    const matchLang = lang === 'all' || cardLang === lang;

                    if (matchPlatform && matchLang) {
                        card.style.display = 'block';
                        visibleCount++;
                    } else {
                        card.style.display = 'none';
                    }
                });
                const countBadge = col.querySelector('.col-count');
                if (countBadge) countBadge.textContent = visibleCount;
            });
        }
    </script>
</body>
</html>
    `;
}

function renderLogin(error = null) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>Login | Mission Control</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #050505;
            --primary: #2C7873;
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
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            -webkit-font-smoothing: antialiased;
        }
        .login-card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            padding: 3rem;
            border-radius: 20px;
            width: 100%;
            max-width: 400px;
            backdrop-filter: blur(20px);
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }
        header { text-align: center; margin-bottom: 2.5rem; }
        h1 { font-size: 1.8rem; font-weight: 300; letter-spacing: -0.02em; margin-bottom: 0.5rem; }
        .subtitle { color: var(--primary); text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.7rem; }
        .form-group { margin-bottom: 1.5rem; }
        label { display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
        input {
            width: 100%;
            padding: 1rem;
            background: rgba(255,255,255,0.03);
            border: 1px solid var(--card-border);
            border-radius: 12px;
            color: white;
            font-size: 1rem;
            outline: none;
            transition: border-color 0.2s;
        }
        input:focus { border-color: var(--primary); }
        button {
            width: 100%;
            padding: 1rem;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: transform 0.2s, opacity 0.2s;
            margin-top: 1rem;
        }
        button:hover { opacity: 0.9; }
        button:active { transform: scale(0.98); }
        .error { color: #ff4757; font-size: 0.8rem; text-align: center; margin-bottom: 1.5rem; background: rgba(255, 71, 87, 0.1); padding: 0.8rem; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="login-card">
        <header>
            <div class="subtitle">Breathe Collection</div>
            <h1>Mission Control</h1>
        </header>

        ${error ? `<div class="error">${error}</div>` : ''}

        <form action="/mission-control-x89/login" method="POST">
            <div class="form-group">
                <label>Email Address</label>
                <input type="email" name="email" required placeholder="name@domain.com">
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" name="password" required placeholder="••••••••">
            </div>
            <button type="submit">Access Pipeline</button>
        </form>
    </div>
</body>
</html>
    `;
}

function renderManual() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pipeline Guide | Breathe Collection</title>
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
            line-height: 1.8;
            padding: 4rem 2rem;
            -webkit-font-smoothing: antialiased;
        }
        .container { max-width: 800px; margin: 0 auto; }
        header { margin-bottom: 4rem; }
        .subtitle { color: var(--secondary); text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.8rem; margin-bottom: 1rem; }
        h1 { font-size: 3rem; font-weight: 300; letter-spacing: -0.02em; margin-bottom: 2rem; }
        
        .nav-back { display: inline-block; margin-bottom: 2rem; color: var(--text-muted); text-decoration: none; font-size: 0.9rem; transition: color 0.2s; }
        .nav-back:hover { color: white; }

        section { margin-bottom: 4rem; }
        h2 { font-size: 1.5rem; font-weight: 400; color: var(--secondary); margin-bottom: 1.5rem; border-bottom: 1px solid var(--card-border); padding-bottom: 0.5rem; }
        p { margin-bottom: 1.5rem; font-weight: 300; color: rgba(255,255,255,0.8); }
        
        .box { background: var(--card-bg); border: 1px solid var(--card-border); padding: 2rem; border-radius: 20px; margin-bottom: 2rem; }
        .box-title { color: var(--accent); font-weight: 500; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1rem; }
        
        ul { list-style: none; margin-bottom: 1.5rem; }
        li { position: relative; padding-left: 1.5rem; margin-bottom: 0.8rem; color: var(--text-muted); font-size: 0.95rem; }
        li::before { content: "→"; position: absolute; left: 0; color: var(--secondary); }

        .tag { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; margin-right: 0.5rem; }
        .tag-do { background: rgba(46, 213, 115, 0.1); color: #2ed573; border: 1px solid rgba(46, 213, 115, 0.3); }
        .tag-dont { background: rgba(255, 71, 87, 0.1); color: #ff4757; border: 1px solid rgba(255, 71, 87, 0.3); }
    </style>
</head>
<body>
    <div class="container">
        <a href="/mission-control-x89" class="nav-back">← Back to Dashboard</a>
        <header>
            <div class="subtitle">Breathe Collection</div>
            <h1>The Freelancer’s Guide to Influencer Selection</h1>
            <p style="font-size: 1.2rem; color: var(--text-muted);">This manual defines our brand identity ("Quiet Luxury") and the strict selection criteria for the influencer pipeline.</p>
        </header>

        <section>
            <h2>1. Our Visual Aesthetic</h2>
            <div class="box">
                <div class="box-title">"Quiet Luxury" defined</div>
                <p>We do not use loud, cluttered, or aggressive marketing. Everything must feel expensive, minimalist, and emotionally grounded.</p>
                <ul>
                    <li><span class="tag tag-do">DO</span> Cinematic lighting and high production value.</li>
                    <li><span class="tag tag-do">DO</span> Natural, neutral color palettes (G10 grading).</li>
                    <li><span class="tag tag-dont">DON'T</span> Neon text, fast-cut memes, or "hype" energy.</li>
                    <li><span class="tag tag-dont">DON'T</span> Cluttered or messy backgrounds (bedrooms, gyms with generic gear).</li>
                </ul>
            </div>
        </section>

        <section>
            <h2>2. Niche Alignment</h2>
            <p>We are targeting high-performers, not just general fitness enthusiasts. Look for creators in these specific circles:</p>
            <ul>
                <li><strong>Biohackers</strong>: People measuring HRV, sleep cycles, and focus.</li>
                <li><strong>Performance Yoga</strong>: Advanced practitioners focused on the science of movement.</li>
                <li><strong>Mental Optimization</strong>: Founders, high-level executives, and "deep work" advocates.</li>
                <li><strong>Protocol-driven</strong>: People who follow Huberman, Wim Hof, or Peter Attia methodologies.</li>
            </ul>
        </section>

        <section>
            <h2>3. Safety & Avoid List</h2>
            <div class="box" style="border-color: var(--accent);">
                <div class="box-title" style="color: var(--accent);">⚠️ STRICT RULES</div>
                <p>To protect our brand authority, we never contact the following profiles. The automated Scout blocks these by default, but you must ignore them if they bypass the filter:</p>
                <ul>
                    <li><strong>Authorities</strong>: Never contact Andrew Huberman, Wim Hof, or their official staff accounts.</li>
                    <li><strong>Direct Competitors</strong>: Do not contact creators heavily sponsored by <strong>Calm</strong> or <strong>Headspace</strong>.</li>
                    <li><strong>Medical Claims</strong>: Avoid creators making unauthorized medical claims about "curing" diseases.</li>
                </ul>
            </div>
        </section>

        <section>
            <h2>4. The Pipeline Stages</h2>
            <ul>
                <li><strong>Discovery</strong>: The raw list found by AI. Review these first.</li>
                <li><strong>Researching</strong>: Move here if you are actively vetting their specific content.</li>
                <li><strong>Approved</strong>: The creator fits our "Quiet Luxury" aesthetic perfectly.</li>
                <li><strong>Outreach Sent</strong>: You have sent the initial DM/Email using the provided draft.</li>
                <li><strong>Archive (Rejected)</strong>: Move here if they are a competitor or low quality.</li>
            </ul>
        </section>

        <footer style="margin-top: 6rem; padding-top: 2rem; border-top: 1px solid var(--card-border); color: var(--text-muted); font-size: 0.8rem; text-align: center;">
            &copy; 2026 Breathe Collection &middot; Internal Documents Only
        </footer>
    </div>
</body>
</html>
    `;
}

module.exports = { renderAdminDashboard, renderLogin, renderManual };

