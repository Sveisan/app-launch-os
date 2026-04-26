const esc = str => String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function timeAgo(d) {
    if (!d) return ''
    const diff = Date.now() - new Date(d).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const days = Math.floor(h / 24)
    return `${days}d ago`
}

function renderDailyValueCard(it) {
    const statusButtons = ['new','drafted','replied','skipped']
        .filter(s => s !== it.status)
        .map(s => `<button onclick="dvSetStatus(${it.id}, '${s}', this)" style="background:none;border:1px solid var(--card-border);color:var(--text-muted);padding:0.3rem 0.6rem;border-radius:6px;font-size:0.7rem;cursor:pointer;">&rarr; ${s}</button>`)
        .join(' ')

    return `
    <div class="dv-card" data-id="${it.id}" data-status="${it.status}" style="background: var(--bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem;">
            <div style="font-size:0.8rem;color:var(--text-muted);">@${esc(it.commenter_handle)} &middot; ${esc(it.platform)} &middot; ${esc(timeAgo(it.comment_posted_at))}</div>
        </div>
        <div style="font-size:0.95rem;color:white;margin-bottom:0.8rem;">${esc(it.comment_text)}</div>
        <div style="display:flex;gap:0.6rem;align-items:center;background:rgba(255,255,255,0.02);border:1px solid var(--card-border);border-radius:8px;padding:0.5rem;margin-bottom:0.8rem;">
            ${it.post.thumbnail_url ? `<img src="${esc(it.post.thumbnail_url)}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;flex:0 0 36px;"/>` : ''}
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.75rem;color:var(--secondary);">@${esc(it.post.account_handle)}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc((it.post.caption || '').slice(0, 100))}</div>
            </div>
            <a href="${esc(it.post.post_url)}" target="_blank" style="color:var(--secondary);font-size:0.75rem;text-decoration:none;flex:0 0 auto;">View &#8599;</a>
        </div>
        <textarea data-id="${it.id}" onblur="dvSaveDraft(${it.id}, this.value)" style="width:100%;background:rgba(255,255,255,0.03);border:1px solid var(--card-border);color:white;border-radius:8px;padding:0.6rem;font-size:0.85rem;font-family:inherit;resize:vertical;min-height:60px;margin-bottom:0.6rem;">${esc(it.reply_draft || '')}</textarea>
        <div style="display:flex;justify-content:space-between;gap:0.4rem;flex-wrap:wrap;">
            <button onclick="dvCopyDraft(${it.id})" style="background:rgba(82,171,152,0.1);color:var(--secondary);border:1px solid rgba(82,171,152,0.3);padding:0.3rem 0.6rem;border-radius:6px;font-size:0.7rem;cursor:pointer;">Copy</button>
            <a href="${esc(it.post.post_url)}" target="_blank" style="background:rgba(255,255,255,0.05);color:white;border:1px solid var(--card-border);padding:0.3rem 0.6rem;border-radius:6px;font-size:0.7rem;text-decoration:none;">Open post</a>
            ${statusButtons}
        </div>
    </div>
    `
}

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
        
        .badge-manual {
            background: rgba(224, 123, 57, 0.1);
            color: var(--accent);
            border: 1px solid rgba(224, 123, 57, 0.3);
            padding: 0.2rem 0.6rem;
            border-radius: 100px;
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        
        .filter-bar {
            display: flex;
            gap: 1rem;
            margin-bottom: 2rem;
            background: rgba(255,255,255,0.02);
            padding: 0.5rem;
            border-radius: 12px;
            border: 1px solid var(--card-border);
            width: fit-content;
        }
        .filter-btn {
            background: transparent;
            border: none;
            color: var(--text-muted);
            padding: 0.6rem 1.2rem;
            border-radius: 8px;
            font-size: 0.85rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }
        .filter-btn:hover { color: white; background: rgba(255,255,255,0.03); }
        .filter-btn.active {
            background: var(--primary);
            color: white;
            box-shadow: 0 4px 12px rgba(44, 120, 115, 0.2);
        }
        
        .empty-state { text-align: center; padding: 4rem; color: var(--text-muted); font-weight: 300; }
        
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        
        .kanban-card { transition: transform 0.2s, background 0.2s; cursor: grab; }
        .kanban-card:hover { transform: translateY(-2px); background: rgba(255, 255, 255, 0.05) !important; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        .kanban-card:active { cursor: grabbing; }
        .drag-over { background: rgba(82, 171, 152, 0.1) !important; border-color: var(--secondary) !important; }

        .nav-btn {
            background: rgba(255,255,255,0.05);
            border: 1px solid var(--card-border);
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.85rem;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .nav-btn:hover { background: rgba(255,255,255,0.1); }
        .nav-btn:active { transform: scale(0.95); }

        @media (max-width: 768px) {
            body { padding: 1rem; }
            header { margin-bottom: 2rem; }
            h1 { font-size: 1.8rem; }
            .stat-value { font-size: 2rem; }
            .kanban-board { gap: 1rem; }
            .modal-content { width: 95% !important; padding: 1.5rem !important; }
            
            .modal-status-bar {
                flex-direction: column !important;
                align-items: stretch !important;
                gap: 1.2rem !important;
            }
            .nav-btn {
                padding: 0.8rem 1.5rem !important;
                font-size: 1rem !important;
                flex: 1;
            }
            #modalStatusBadge {
                width: 100% !important;
                padding: 0.6rem !important;
                font-size: 0.9rem !important;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
                <div class="subtitle">Breathe Collection Core</div>
                <h1>Control Panel</h1>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <button onclick="openAddLeadModal()" style="background: var(--primary); color: white; border: none; padding: 0.8rem 1.5rem; border-radius: 12px; font-size: 0.9rem; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; transition: transform 0.2s;">
                    + Add Influencer
                </button>
                <a href="/mission-control-x89/manual" style="background: rgba(82, 171, 152, 0.1); color: var(--secondary); border: 1px solid rgba(82, 171, 152, 0.3); padding: 0.8rem 1.5rem; border-radius: 12px; font-size: 0.9rem; text-decoration: none; font-weight: 500; display: flex; align-items: center; gap: 0.5rem; transition: background 0.2s;">
                    Guide & Safety 📖
                </a>
            </div>
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
                <div class="stat-value">${stats.codesLeft.trial}</div>
                <div class="stat-label">1-Month Codes Remaining</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.codesLeft.lifetime}</div>
                <div class="stat-label">Lifetime Codes Remaining</div>
            </div>
        </div>

        ${isOwner ? `
        <h2 class="section-title">Video Studio (TikTok Pipeline)</h2>
        <div id="videoStudioCard" class="card" style="background: var(--card-bg); border: 1px solid var(--card-border); padding: 2rem; border-radius: 20px; margin-bottom: 3rem;">
            <div class="modal-status-bar" style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 2rem;">
                <div>
                    <h3 style="font-weight: 400; font-size: 1.2rem; margin-bottom: 0.5rem;">Automated Batch Production</h3>
                    <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 500px;">Generate 6 research-backed TikTok videos (9:16) with Ultra-Glass aesthetics and Liam voiceover. Total production time is ~3-4 minutes.</p>
                </div>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button id="clearCacheBtn" class="btn" style="background: transparent; border: 1px solid var(--card-border); opacity: 0.6; padding: 0.8rem 1.5rem; border-radius: 12px; color: white;">Clear Cache</button>
                    <button id="generateVideosBtn" class="btn-primary" style="background: var(--primary); color: white; border: none; padding: 0.8rem 1.5rem; border-radius: 12px; font-size: 0.9rem; font-weight: 500; cursor: pointer;">● Generate 6 TikTok Videos</button>
                </div>
            </div>

            <div id="videoProgressGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                <!-- Filled via JS -->
                <div class="empty-state" style="grid-column: 1/-1; padding: 2rem; border: 1px dashed var(--card-border); border-radius: 12px;">No active production. Click generate to start.</div>
            </div>
        </div>
        ` : ''}

        <h2 class="section-title">Daily Value</h2>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: -1rem; margin-bottom: 2rem;">Comment threads worth showing up in. Refreshed nightly at 06:00.</p>

        ${isOwner ? `
        <div class="modal-status-bar" style="margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between; background: rgba(82, 171, 152, 0.05); border: 1px dashed rgba(82, 171, 152, 0.3); padding: 1.5rem; border-radius: 16px;">
            <div>
                <h3 style="font-weight: 400; font-size: 1rem; margin-bottom: 0.2rem;">Manual Refresh</h3>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0;">Trigger the digest now instead of waiting for the cron.</p>
            </div>
            <div style="display: flex; gap: 10px;">
                <button id="dvRunNow" class="nav-btn" style="padding: 0.6rem 1.5rem;">Run Now</button>
            </div>
        </div>
        ` : ''}

        <div class="kanban-board" style="display: flex; gap: 1.5rem; overflow-x: auto; padding-bottom: 2rem;">
            ${['new','drafted','replied','skipped'].map(status => {
                const title = { new: 'New', drafted: 'Drafted', replied: 'Replied', skipped: 'Skipped' }[status];
                const items = (stats.dailyValueByStatus && stats.dailyValueByStatus[status]) || [];
                return `
                <div class="kanban-column" data-board="daily-value" data-status="${status}" id="dv-col-${status}" style="flex: 0 0 320px; min-height: 40vh; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 16px; padding: 1.5rem; display: flex; flex-direction: column; max-height: 70vh;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h4 style="font-weight: 500; font-size: 1rem;">${title}</h4>
                        <span style="background: rgba(255,255,255,0.1); padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem;">${items.length}</span>
                    </div>
                    <div class="dv-cards" id="dv-cards-${status}" style="overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 1rem; padding-right: 0.5rem;">
                        ${items.length === 0 ? `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 2rem 0;">Empty</div>` : items.map(it => renderDailyValueCard(it)).join('')}
                    </div>
                </div>
                `;
            }).join('')}
        </div>

        <h2 class="section-title">Influencer Pipeline</h2>
        
        ${isOwner ? `
        <div class="modal-status-bar" style="margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between; background: rgba(82, 171, 152, 0.05); border: 1px dashed rgba(82, 171, 152, 0.3); padding: 1.5rem; border-radius: 16px;">
            <div>
                <h3 style="font-weight: 400; font-size: 1rem; margin-bottom: 0.2rem;">Manual Override</h3>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0;">Bypass the hourly timer and send Scout out now.</p>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button id="triggerSweep" class="nav-btn" style="padding: 0.6rem 1.5rem;">Trigger Sweep</button>
                <button id="testMission" class="nav-btn" style="background: rgba(46, 213, 115, 0.1); color: #2ed573; border-color: #2ed573;">Run Test Mission</button>
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

        <div class="filter-bar" id="platformFilter">
            <button class="filter-btn active" onclick="setPlatform('all')">All Platforms</button>
            <button class="filter-btn" onclick="setPlatform('TikTok')">TikTok</button>
            <button class="filter-btn" onclick="setPlatform('Instagram')">Instagram</button>
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
                
                const totalCount = stats.totalCounts ? (stats.totalCounts[status] || 0) : leads.length;
                
                return `
                <div class="kanban-column" id="col-${status}" ondrop="drop(event, '${status}')" ondragover="allowDrop(event)" ondragenter="dragEnter(event)" ondragleave="dragLeave(event)" style="flex: 0 0 320px; min-height: 60vh; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 16px; padding: 1.5rem; display: flex; flex-direction: column; max-height: 85vh; transition: all 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h4 style="font-weight: 500; font-size: 1rem; text-transform: capitalize;">${title}</h4>
                        <span class="col-count-container" style="background: rgba(255,255,255,0.1); padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem;">
                            <span class="col-count">${leads.length}</span>
                        </span>
                    </div>
                    
                    <div class="kanban-cards" id="cards-${status}" style="overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 1rem; padding-right: 0.5rem;" data-status="${status}">
                        ${leads.length === 0 ? `<div class="empty-placeholder" style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 2rem 0; pointer-events: none;">Empty</div>` : leads.map(lead => {
                            
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
                            <div id="card-${lead.id}" class="kanban-card" 
                                 onpointerdown="window.cardStartX = event.clientX; window.cardStartY = event.clientY"
                                 onpointerup="if(Math.abs(event.clientX - (window.cardStartX||0)) < 5 && Math.abs(event.clientY - (window.cardStartY||0)) < 5) openModal(this.getAttribute('data-lead'))"
                                 data-id="${lead.id}" data-platform="${esc(lead.platform)}" data-lang="${lang}" data-lead="${encodeURIComponent(JSON.stringify(lead))}" 
                                 style="background: var(--bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 1rem; position: relative; cursor: pointer; transition: transform 0.1s, box-shadow 0.1s; -webkit-tap-highlight-color: transparent;">
                                
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.8rem;">
                                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                                        <div draggable="true" ondragstart="drag(event, ${lead.id})" title="Drag to reorder" style="cursor: grab; padding: 4px 6px; background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); border-radius: 4px; color: var(--text-muted); font-size: 1.1rem; line-height: 1; user-select: none;">⠿</div>
                                        <span class="score score-high" style="pointer-events: none;">${esc(lead.fit_score)}</span>
                                        ${lead.manually_added ? '<span class="badge-manual" style="pointer-events: none;">Manual</span>' : ''}
                                    </div>
                                    <div class="kanban-actions" style="display: flex; gap: 0.2rem; z-index: 20; pointer-events: auto;">
                                        ${status !== 'rejected' ? `<button draggable="false" onclick="event.stopPropagation(); updateStatus(${lead.id}, 'rejected', event)" title="Reject" style="background:none; border:none; color: rgba(255, 71, 87, 0.4); cursor:pointer; font-size: 1.2rem; line-height: 1; padding: 4px;">✕</button>` : ''}
                                        ${prevStatus ? `<button draggable="false" onclick="event.stopPropagation(); updateStatus(${lead.id}, '${prevStatus}', event)" title="Move Back" style="background:none; border:none; color: rgba(255,255,255,0.2); cursor:pointer; font-size: 1.2rem; line-height: 1; padding: 4px;">←</button>` : ''}
                                        ${nextStatus ? `<button draggable="false" onclick="event.stopPropagation(); updateStatus(${lead.id}, '${nextStatus}', event)" title="Move Forward" style="background:none; border:none; color: rgba(255,255,255,0.2); cursor:pointer; font-size: 1.2rem; line-height: 1; padding: 4px;">→</button>` : ''}
                                    </div>
                                </div>
                                
                                <div style="font-weight: 500; font-size: 0.95rem; margin-bottom: 0.2rem; color: white; pointer-events: none;">@${esc(lead.handle)}</div>
                                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 1.2rem; pointer-events: none;">${esc(lead.platform)} &middot; ${esc(lead.niche)}</div>
                                
                                <div style="padding-top: 0.8rem; border-top: 1px solid rgba(255,255,255,0.03); display: flex; justify-content: flex-end;">
                                    <button draggable="false" onclick="event.stopPropagation(); openModal(this.closest('.kanban-card').getAttribute('data-lead'))" 
                                            class="view-btn"
                                            style="background: rgba(82, 171, 152, 0.1); color: var(--secondary); border: 1px solid rgba(82, 171, 152, 0.2); padding: 0.4rem 0.8rem; border-radius: 8px; font-size: 0.75rem; font-weight: 500; cursor: pointer; transition: all 0.2s; pointer-events: auto;">
                                        View Dossier →
                                    </button>
                                </div>
                            </div>
                            `
                        }).join('')}
                    </div>
                    <button class="load-more-btn" id="btn-load-${status}" onclick="loadMore('${status}')" style="display: none; margin-top: 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--card-border); color: var(--text-muted); padding: 0.8rem; border-radius: 8px; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.2s; width: 100%;">
                        Load More leads...
                    </button>
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

                <div id="modalPostContext" style="background: rgba(44, 120, 115, 0.05); border: 1px solid rgba(44, 120, 115, 0.2); padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem;">
                    <h4 style="font-weight: 500; color: var(--secondary); font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.8rem; letter-spacing: 0.05em;">Profile Context</h4>
                    <p id="modalPostCaption" style="font-size: 0.9rem; line-height: 1.5; color: var(--text-main); margin-bottom: 1rem; white-space: pre-wrap;"></p>
                    <div style="display: flex; gap: 0.8rem;">
                        <a id="modalPostLink" href="#" target="_blank" style="background: rgba(255,255,255,0.05); color: white; border: 1px solid var(--card-border); padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.8rem; text-decoration: none;">View Post ↗</a>
                        <a id="modalProfileLink" href="#" target="_blank" style="background: rgba(255,255,255,0.05); color: white; border: 1px solid var(--card-border); padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.8rem; text-decoration: none;">View Profile ↗</a>
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
                        <div style="display: flex; gap: 0.5rem;">
                            <button id="regenerateBtn" onclick="regenerateDraft()" style="background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); color: var(--text-muted); padding: 0.4rem 1rem; border-radius: 6px; font-size: 0.75rem; cursor: pointer; transition: all 0.2s;">↺ Regenerate</button>
                            <button onclick="copyDraft()" style="background: rgba(255,255,255,0.1); border: 1px solid var(--card-border); color: white; padding: 0.4rem 1rem; border-radius: 6px; font-size: 0.75rem; cursor: pointer; transition: background 0.2s;">Copy to Clipboard</button>
                        </div>
                    </div>
                    <div style="position: relative;">
                        <textarea id="modalDraft" style="width: 100%; height: 200px; background: transparent; border: none; color: var(--text-main); font-family: inherit; font-size: 1rem; line-height: 1.6; padding: 1.5rem; resize: vertical; outline: none;"></textarea>
                    </div>
                </div>

                <div style="margin-top: 1.5rem;">
                    <h4 style="font-weight: 500; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.5rem; letter-spacing: 0.05em;">Freelancer Notes</h4>
                    <textarea id="modalNotes" placeholder="e.g. DMed on TikTok, awaiting reply..."
                              style="width: 100%; height: 80px; background: rgba(0,0,0,0.2); border: 1px solid var(--card-border); border-radius: 12px; color: var(--text-main); font-family: inherit; font-size: 0.9rem; padding: 1rem; resize: vertical; outline: none; margin-bottom: 0.8rem;"></textarea>
                    <button id="saveNotesBtn" onclick="saveNotes()" style="background: var(--primary); color: white; border: none; padding: 0.5rem 1.2rem; border-radius: 8px; font-size: 0.85rem; font-weight: 500; cursor: pointer;">Save Notes</button>
                </div>

                <div class="modal-status-bar" style="margin-top: 1.5rem; display: flex; align-items: center; gap: 1rem; background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 12px; border: 1px solid var(--card-border);">
                    <span style="font-size: 0.85rem; color: var(--text-muted);">Pipeline Status:</span>
                    <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1;">
                        <button id="modalPrevBtn" class="nav-btn" onclick="modalMoveStatus(-1)">← Back</button>
                        <span id="modalStatusBadge" style="background: var(--primary); color: white; padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.75rem; font-weight: 500; min-width: 100px; text-align: center;">Discovery</span>
                        <button id="modalNextBtn" class="nav-btn" onclick="modalMoveStatus(1)">Forward →</button>
                        <button class="nav-btn" onclick="rejectLead()" style="margin-left: auto; background: rgba(255, 71, 87, 0.1); border: 1px solid rgba(255, 71, 87, 0.3); color: #ff4757;">Not Relevant / Reject</button>
                    </div>
                </div>

                <div style="margin-top: 2rem; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <!-- Monthly Reward -->
                    <div id="reward-trial" style="background: rgba(224, 123, 57, 0.05); border: 1px dashed rgba(224, 123, 57, 0.3); padding: 1.5rem; border-radius: 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
                        <div>
                            <h4 style="font-weight: 500; color: var(--accent); font-size: 0.9rem; margin-bottom: 0.2rem;">1 Month Pro Access</h4>
                            <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">Standard onboarding code. <br><strong>${stats.codesLeft.trial}</strong> remaining.</p>
                        </div>
                        <div id="promoContainer-trial">
                            <button id="claimCodeBtn-trial" onclick="claimCode('trial')" style="background: var(--accent); color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 8px; font-size: 0.85rem; font-weight: 500; cursor: pointer; width: 100%;">Claim 1-Month</button>
                        </div>
                    </div>

                    <!-- Lifetime Reward -->
                    <div id="reward-lifetime" style="background: rgba(82, 171, 152, 0.05); border: 1px dashed rgba(82, 171, 152, 0.3); padding: 1.5rem; border-radius: 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
                        <div>
                            <h4 style="font-weight: 500; color: var(--secondary); font-size: 0.9rem; margin-bottom: 0.2rem;">Lifetime Pro Access</h4>
                            <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">High-value reward for top creators. <br><strong>${stats.codesLeft.lifetime}</strong> remaining.</p>
                        </div>
                        <div id="promoContainer-lifetime">
                            <button id="claimCodeBtn-lifetime" onclick="claimCode('lifetime')" style="background: var(--secondary); color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 8px; font-size: 0.85rem; font-weight: 500; cursor: pointer; width: 100%;">Claim Lifetime</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Add Lead Modal -->
        <div id="addLeadModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(5px); z-index: 1100; align-items: center; justify-content: center;">
            <div style="background: var(--bg); border: 1px solid var(--card-border); border-radius: 24px; width: 90%; max-width: 450px; padding: 2.5rem; position: relative; box-shadow: 0 30px 60px rgba(0,0,0,0.5);">
                <button onclick="closeAddLeadModal()" style="position: absolute; top: 1.5rem; right: 1.5rem; background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); border-radius: 50%; color: white; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; cursor: pointer;">&times;</button>
                
                <div style="text-align: center; margin-bottom: 2rem;">
                    <div style="width: 60px; height: 60px; background: rgba(44, 120, 114, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
                        <span style="font-size: 1.5rem;">👤</span>
                    </div>
                    <h2 style="font-weight: 400; font-size: 1.5rem; margin-bottom: 0.5rem;">Add Influencer</h2>
                    <p style="color: var(--text-muted); font-size: 0.85rem;">Add a lead manually to the Discovery column.</p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 1.2rem;">
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <label style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Handle</label>
                        <input id="addHandle" type="text" placeholder="@username" 
                               style="width: 100%; padding: 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--card-border); border-radius: 12px; color: white; font-size: 1rem; outline: none; transition: border-color 0.2s;">
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <label style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Platform</label>
                        <select id="addPlatform" 
                                style="width: 100%; padding: 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--card-border); border-radius: 12px; color: white; font-size: 1rem; outline: none; cursor: pointer; transition: border-color 0.2s;">
                            <option value="TikTok">TikTok</option>
                            <option value="Instagram">Instagram</option>
                        </select>
                    </div>

                    <button id="submitAddLeadBtn" onclick="submitAddLead()" 
                            style="margin-top: 1rem; width: 100%; padding: 1rem; background: var(--primary); color: white; border: none; border-radius: 12px; font-size: 1rem; font-weight: 500; cursor: pointer; transition: transform 0.2s, opacity 0.2s;">
                        Add to Pipeline
                    </button>
                    <button onclick="closeAddLeadModal()" 
                            style="width: 100%; background: transparent; color: var(--text-muted); border: none; font-size: 0.9rem; cursor: pointer;">
                        Cancel
                    </button>
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
        // Global State & Core Configuration
        const modal = document.getElementById('leadModal');
        let currentHandle = '';
        let currentLeadId = null;
        let currentLeadStatus = '';
        const statusOrder = ['discovery', 'researching', 'approved', 'outreach_sent'];
        const statusLabels = {
            discovery: 'Discovery', researching: 'Researching',
            approved: 'Approved', outreach_sent: 'Outreach Sent', rejected: 'Archive'
        };

        // --- Platform Filter & Pagination State --- //
        const PAGE_SIZE = 10;
        const columnState = {}; // { [status]: { page: 1, platform: 'all' } }

        const escJS = str => String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

        function openModal(leadStr) {
            if (!modal) return;
            const lead = JSON.parse(decodeURIComponent(leadStr));
            currentHandle = lead.handle;
            document.getElementById('modalScore').textContent = lead.fit_score;
            document.getElementById('modalHandle').textContent = '@' + lead.handle;
            
            let profileUrl = lead.post_url;
            if (!profileUrl) {
                const cleanHandle = lead.handle.replace('@', '');
                profileUrl = lead.platform && lead.platform.toLowerCase() === 'tiktok' 
                    ? 'https://tiktok.com/@' + cleanHandle 
                    : 'https://instagram.com/' + cleanHandle;
            }
            document.getElementById('modalLink').href = profileUrl;
            document.getElementById('modalFollowers').textContent = (lead.followers_count || lead.followers || 0).toLocaleString();
            document.getElementById('modalER').textContent = Number(lead.engagement_rate || 0).toFixed(1);
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
            
            currentLeadId = lead.id;
            currentLeadStatus = lead.pipeline_status || 'discovery';
            document.getElementById('modalNotes').value = lead.freelancer_notes || '';
            document.getElementById('modalPostCaption').textContent = lead.post_caption || 'No caption available.';
            
            const cleanHandle2 = lead.handle.replace('@', '');
            document.getElementById('modalProfileLink').href = lead.platform && lead.platform.toLowerCase() === 'tiktok' 
                ? 'https://tiktok.com/@' + cleanHandle2 
                : 'https://instagram.com/' + cleanHandle2;
            document.getElementById('modalPostLink').href = lead.post_url || '#';
            document.getElementById('modalPostLink').style.display = lead.post_url ? 'inline-block' : 'none';

            const statusLabel = statusLabels[currentLeadStatus] || currentLeadStatus;
            document.getElementById('modalStatusBadge').textContent = statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1);
            
            const idx = statusOrder.indexOf(currentLeadStatus);
            document.getElementById('modalPrevBtn').disabled = idx <= 0;
            document.getElementById('modalNextBtn').disabled = idx < 0 || idx >= statusOrder.length - 1;

            if (modal) modal.style.display = 'flex';
        }

        function closeModal() {
            if (modal) modal.style.display = 'none';
        }

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

        if (btn) {
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

        function renderLeadCard(lead, status) {
            const cols = ['discovery', 'researching', 'approved', 'outreach_sent'];
            const idx = cols.indexOf(status);
            const prevStatus = idx > 0 ? cols[idx - 1] : null;
            const nextStatus = idx >= 0 && idx < cols.length - 1 ? cols[idx + 1] : null;

            const noTags = ['pust', 'pusteteknikk', 'stressmestring', 'biohackingnorge'];
            const esTags = ['respiracion', 'meditacion', 'bienestar', 'respiracao', 'bemestar', 'saudemental', 'ansiedade', 'estresse', 'saludmental'];
            const nicheLower = (lead.niche || '').toLowerCase();
            let lang = 'en';
            if (noTags.includes(nicheLower)) lang = 'no';
            else if (esTags.includes(nicheLower)) lang = 'es';

            const encoded = encodeURIComponent(JSON.stringify(lead));
            const esc = str => String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

            return \`
                <div id="card-\${lead.id}" class="kanban-card" 
                     onpointerdown="window.cardStartX = event.clientX; window.cardStartY = event.clientY"
                     onpointerup="if(Math.abs(event.clientX - (window.cardStartX||0)) < 5 && Math.abs(event.clientY - (window.cardStartY||0)) < 5) openModal(this.getAttribute('data-lead'))"
                     data-id="\${lead.id}" data-platform="\${esc(lead.platform)}" data-lang="\${lang}" data-lead="\${encoded}" 
                     style="background: var(--bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 1rem; position: relative; cursor: pointer; transition: transform 0.1s, box-shadow 0.1s; -webkit-tap-highlight-color: transparent;">
                    
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.8rem;">
                        <div style="display: flex; align-items: center; gap: 0.6rem;">
                            <div draggable="true" ondragstart="drag(event, \${lead.id})" title="Drag to reorder" style="cursor: grab; padding: 4px 6px; background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); border-radius: 4px; color: var(--text-muted); font-size: 1.1rem; line-height: 1; user-select: none;">⠿</div>
                            <span class="score score-high" style="pointer-events: none;">\${esc(lead.fit_score)}</span>
                            \${lead.manually_added ? '<span class="badge-manual" style="pointer-events: none;">Manual</span>' : ''}
                        </div>
                        <div class="kanban-actions" style="display: flex; gap: 0.2rem; z-index: 20; pointer-events: auto;">
                            \${status !== 'rejected' ? \`<button draggable="false" onclick="event.stopPropagation(); updateStatus(\${lead.id}, 'rejected', event)" title="Reject" style="background:none; border:none; color: rgba(255, 71, 87, 0.4); cursor:pointer; font-size: 1.2rem; line-height: 1; padding: 4px;">✕</button>\` : ''}
                            \${prevStatus ? \`<button draggable="false" onclick="event.stopPropagation(); updateStatus(\${lead.id}, '\${prevStatus}', event)" title="Move Back" style="background:none; border:none; color: rgba(255,255,255,0.2); cursor:pointer; font-size: 1.2rem; line-height: 1; padding: 4px;">←</button>\` : ''}
                            \${nextStatus ? \`<button draggable="false" onclick="event.stopPropagation(); updateStatus(\${lead.id}, '\${nextStatus}', event)" title="Move Forward" style="background:none; border:none; color: rgba(255,255,255,0.2); cursor:pointer; font-size: 1.2rem; line-height: 1; padding: 4px;">→</button>\` : ''}
                        </div>
                    </div>
                    
                    <div style="font-weight: 500; font-size: 0.95rem; margin-bottom: 0.2rem; color: white; pointer-events: none;">@\${esc(lead.handle)}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 1.2rem; pointer-events: none;">\${esc(lead.platform)} &middot; \${esc(lead.niche)}</div>
                    
                    <div style="padding-top: 0.8rem; border-top: 1px solid rgba(255,255,255,0.03); display: flex; justify-content: flex-end;">
                        <button draggable="false" onclick="event.stopPropagation(); openModal(this.closest('.kanban-card').getAttribute('data-lead'))" 
                                class="view-btn"
                                style="background: rgba(82, 171, 152, 0.1); color: var(--secondary); border: 1px solid rgba(82, 171, 152, 0.2); padding: 0.4rem 0.8rem; border-radius: 8px; font-size: 0.75rem; font-weight: 500; cursor: pointer; transition: all 0.2s; pointer-events: auto;">
                            View Dossier →
                        </button>
                    </div>
                </div>
            \`;
        }

          function setPlatform(platform) {
            // Update UI buttons
            document.querySelectorAll('#platformFilter .filter-btn').forEach(btn => {
                const text = btn.textContent.toLowerCase();
                if (text.includes(platform.toLowerCase()) || (platform === 'all' && text.includes('all'))) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            // Reset all columns
            document.querySelectorAll('.kanban-column').forEach(col => {
                const status = col.id.replace('col-', '');
                columnState[status] = { page: 1, platform };
                applyFilter(status);
            });
        }

        function applyFilter(status) {
            const col = document.getElementById('col-' + status);
            const { page, platform } = columnState[status] || { page: 1, platform: 'all' };
            const cards = Array.from(col.querySelectorAll('.kanban-card'));
            
            // Filter by platform
            const matching = platform === 'all' 
                ? cards 
                : cards.filter(c => c.dataset.platform === platform);
            
            // Hide all first
            cards.forEach(c => c.style.display = 'none');
            
            // Show first page of matching
            matching.slice(0, page * PAGE_SIZE).forEach(c => c.style.display = '');
            
            // Update column count
            const countSpan = col.querySelector('.col-count');
            if (countSpan) countSpan.textContent = matching.length;
            
            // Show/hide Load More button
            const btn = document.getElementById('btn-load-' + status);
            if (btn) btn.style.display = matching.length > page * PAGE_SIZE ? 'block' : 'none';
        }

        function loadMore(status) {
            if (!columnState[status]) columnState[status] = { page: 1, platform: 'all' };
            columnState[status].page += 1;
            applyFilter(status);
        }

        // Initialize on Load
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('.kanban-column').forEach(col => {
                const status = col.id.replace('col-', '');
                columnState[status] = { page: 1, platform: 'all' };
                applyFilter(status);
            });
        });

        async function claimCode(rewardType) {
            const btn = document.getElementById('claimCodeBtn-' + rewardType);
            if (!btn) return;
            const originalText = rewardType === 'lifetime' ? 'Claim Lifetime' : 'Claim 1-Month';
            
            btn.disabled = true;
            btn.textContent = 'Claiming...';
            
            try {
                const res = await fetch('/mission-control-x89/claim-code?auth=breathe88', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ handle: currentHandle, rewardType: rewardType })
                });
                const data = await res.json();
                if (data.success) {
                    showCode(data.code, rewardType);
                } else {
                    alert('Error: ' + data.error);
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            } catch (err) {
                alert('Connection failed');
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }

        function showCode(code, type) {
            const fullUrl = 'https://breathecollection.app/creators?code=' + code;
            const container = document.getElementById('promoContainer-' + type);
            if (!container) return;
            
            container.innerHTML = \`
                <div style="display: flex; flex-direction: column; gap: 0.5rem; background: rgba(0,0,0,0.3); padding: 0.6rem; border-radius: 6px; border: 1px solid var(--accent); overflow: hidden;">
                    <code style="color: var(--accent); font-weight: 500; font-size: 0.75rem; word-break: break-all; margin-bottom: 0.3rem;">\${fullUrl}</code>
                    <button onclick="copyToClipboard('\${fullUrl}')" style="background: var(--accent); border: none; color: white; cursor: pointer; font-size: 0.75rem; border-radius: 4px; padding: 0.3rem; font-weight: 500;">Copy URL</button>
                </div>\`;
        }

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text);
            alert('Code copied: ' + text);
        }

        // Modal pipeline navigation
        async function modalMoveStatus(direction) {
            const idx = statusOrder.indexOf(currentLeadStatus);
            const newStatus = statusOrder[idx + direction];
            if (!newStatus || !currentLeadId) return;

            const btnPrev = document.getElementById('modalPrevBtn');
            const btnNext = document.getElementById('modalNextBtn');
            btnPrev.disabled = true;
            btnNext.disabled = true;

            await updateStatus(currentLeadId, newStatus, null); // reuse existing updateStatus()
            
            currentLeadStatus = newStatus;
            openModal(document.getElementById('card-' + currentLeadId).getAttribute('data-lead')); 
        }

        async function rejectLead() {
            if (!currentLeadId) return;
            if (!confirm('Mark this lead as Not Relevant / Rejected?')) return;
            await updateStatus(currentLeadId, 'rejected', null);
            closeModal();
        }

        // Save notes
        async function regenerateDraft() {
            const btn = document.getElementById('regenerateBtn');
            const textarea = document.getElementById('modalDraft');
            const originalText = btn.textContent;

            btn.disabled = true;
            btn.textContent = '↺ Generating...';
            const originalVal = textarea.value;
            textarea.value = 'Generating new draft...';

            try {
                const res = await fetch('/mission-control-x89/regenerate-draft?auth=breathe88', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: currentLeadId })
                });
                const data = await res.json();

                if (data.success) {
                    textarea.value = data.draft;
                    btn.textContent = '✔ Done';
                    btn.style.color = 'var(--secondary)';
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.color = '';
                        btn.disabled = false;
                    }, 2000);
                } else {
                    textarea.value = 'Regeneration failed: ' + data.error + '\\n\\n' + originalVal;
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            } catch (err) {
                textarea.value = 'Connection failed.\\n\\n' + originalVal;
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }

        async function saveNotes() {
            const notes = document.getElementById('modalNotes').value;
            const btn = document.getElementById('saveNotesBtn');
            const originalText = btn.textContent;
            
            btn.disabled = true;
            btn.textContent = 'Saving...';

            try {
                const res = await fetch('/mission-control-x89/save-notes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: currentLeadId, notes })
                });
                const data = await res.json();
                if (data.success) {
                    btn.textContent = 'Saved! ✔';
                    btn.style.background = 'var(--secondary)';
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.background = 'var(--primary)';
                        btn.disabled = false;
                    }, 2000);
                } else {
                    alert('Save failed: ' + data.error);
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            } catch (err) {
                alert('Connection failed');
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        async function updateStatus(id, newStatus, event) {
            if (event) event.stopPropagation();
            if (!newStatus) return;
            
            const card = document.getElementById('card-' + id);
            if (!card) return;

            // Optimistic move
            try {
                const targetCol = document.querySelector('.kanban-cards[data-status="' + newStatus + '"]');
                if (targetCol && card.parentElement !== targetCol) {
                    const sourceCards = card.parentElement;
                    const sourceContainer = sourceCards.closest('.kanban-column');
                    const targetContainer = targetCol.closest('.kanban-column');
                    
                    // Update counts if moving between columns
                    if (sourceContainer && targetContainer && sourceContainer !== targetContainer) {
                        const sourceCount = sourceContainer.querySelector('.col-count');
                        const targetCount = targetContainer.querySelector('.col-count');
                        if (sourceCount) sourceCount.textContent = Math.max(0, parseInt(sourceCount.textContent) - 1);
                        if (targetCount) targetCount.textContent = parseInt(targetCount.textContent) + 1;
                        
                        // Handle placeholders
                        const emptyInTarget = targetCol.querySelector('.empty-placeholder');
                        if (emptyInTarget) emptyInTarget.remove();
                    }

                    targetCol.appendChild(card);
                    
                    // Add placeholder back to source if empty
                    if (sourceCards && sourceCards.querySelectorAll('.kanban-card').length === 0) {
                         const emptyDiv = document.createElement('div');
                         emptyDiv.className = 'empty-placeholder';
                         emptyDiv.style.cssText = 'text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 2rem 0; pointer-events: none;';
                         emptyDiv.textContent = 'Empty';
                         sourceCards.appendChild(emptyDiv);
                    }
                    
                    card.style.opacity = '0.5';
                }
            } catch (err) {
                console.error('Seamless update failed:', err);
            }

            try {
                const res = await fetch('/mission-control-x89/update-status?auth=breathe88', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, status: newStatus })
                });
                const data = await res.json();
                if (data.success) {
                    card.style.opacity = '1';
                } else {
                    console.error('Server side update failed:', data.error);
                    location.reload(); 
                }
            } catch(e) {
                console.error('Network failure:', e);
                location.reload();
            }
        }
        
        // --- Drag and Drop Logic --- //
        window.isDragging = false;
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
            ev.target.style.opacity = '0.5';
        }

        async function drop(ev, newStatus) {
            ev.preventDefault();
            ev.currentTarget.classList.remove('drag-over');
            const id = ev.dataTransfer.getData("text/plain");
            if(id) {
               await updateStatus(id, newStatus, null);
            }
        }
        document.addEventListener('dragend', (ev) => {
             if (ev.target.classList && ev.target.classList.contains('kanban-card')) {
                 ev.target.style.opacity = '1';
             }
        });

        // Test Mission
        const testBtn = document.getElementById('testMission');
        if (testBtn) {
            testBtn.addEventListener('click', async () => {
                testBtn.textContent = 'Generating...';
                testBtn.style.opacity = '0.5';
                
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
                    testBtn.textContent = 'Run Test Mission';
                    testBtn.style.opacity = '1';
                }
            });
        }

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
            if (!progressGrid) return;
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
                if (videoBtn) {
                    videoBtn.disabled = false;
                    videoBtn.textContent = '● Generate 6 TikTok Videos';
                    videoBtn.style.opacity = '1';
                }
            }
        }

        if (videoBtn) {
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
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                if (!confirm('Clear all generated videos?')) return;
                const res = await fetch('/api/video-studio/clear-cache?auth=breathe88', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    alert('Cache cleared.');
                    location.reload();
                }
            });
        }

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
                        card.style.display = '';
                        visibleCount++;
                    } else {
                        card.style.display = 'none';
                    }
                });
                const countBadge = col.querySelector('.col-count');
                if (countBadge) countBadge.textContent = visibleCount;
            });
        }

        // --- Add Lead Manual --- //
        function openAddLeadModal() {
            document.getElementById('addLeadModal').style.display = 'flex';
            document.getElementById('addHandle').focus();
        }

        function closeAddLeadModal() {
            document.getElementById('addLeadModal').style.display = 'none';
            document.getElementById('addHandle').value = '';
        }

        async function submitAddLead() {
            const handle = document.getElementById('addHandle').value.trim();
            const platform = document.getElementById('addPlatform').value;
            const btn = document.getElementById('submitAddLeadBtn');

            if (!handle) {
                alert('Please enter an influencer handle');
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Adding...';

            try {
                const res = await fetch('/mission-control-x89/add-lead?auth=breathe88', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ handle, platform })
                });
                const data = await res.json();

                if (data.success) {
                    btn.textContent = 'Success! ✔';
                    btn.style.background = 'var(--secondary)';
                    setTimeout(() => {
                        closeAddLeadModal();
                        location.reload(); // Refresh to show new lead and updated counts
                    }, 1000);
                } else {
                    alert('Failed to add lead: ' + (data.error || 'Unknown error'));
                    btn.disabled = false;
                    btn.textContent = 'Add to Pipeline';
                }
            } catch (err) {
                alert('Connection failed: ' + err.message);
                btn.disabled = false;
                btn.textContent = 'Add to Pipeline';
            }
        }

        // ----- Daily Value handlers -----
        async function dvSaveDraft(id, draft) {
            try {
                await fetch('/mission-control-x89/daily-value/items/' + id, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reply_draft: draft }),
                })
            } catch (e) { console.error('dvSaveDraft', e) }
        }
        async function dvSetStatus(id, status, btn) {
            try {
                const res = await fetch('/mission-control-x89/daily-value/items/' + id, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status }),
                })
                if (res.ok) {
                    const card = btn.closest('.dv-card')
                    const target = document.getElementById('dv-cards-' + status)
                    if (card && target) target.appendChild(card)
                }
            } catch (e) { console.error('dvSetStatus', e) }
        }
        function dvCopyDraft(id) {
            const ta = document.querySelector('textarea[data-id="' + id + '"]')
            if (!ta) return
            navigator.clipboard.writeText(ta.value).catch(() => {})
        }
        const dvRunBtn = document.getElementById('dvRunNow')
        if (dvRunBtn) {
            dvRunBtn.addEventListener('click', async () => {
                dvRunBtn.disabled = true
                dvRunBtn.textContent = 'Running...'
                try {
                    await fetch('/mission-control-x89/daily-value/run', { method: 'POST' })
                    dvRunBtn.textContent = 'Started — refresh in ~60s'
                } catch (e) {
                    dvRunBtn.textContent = 'Failed'
                }
                setTimeout(() => { dvRunBtn.disabled = false; dvRunBtn.textContent = 'Run Now' }, 5000)
            })
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

