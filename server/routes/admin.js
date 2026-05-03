const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');
const { renderAdminDashboard, renderLogin, renderManual } = require('../templates/admin');
const { scoutAgentRun } = require('../jobs/scout');
const { comparePassword, generateToken, verifyToken } = require('../db/auth');
const { checkAuth, ownerOnly } = require('../middleware/auth');
const dailyValueRouter = require('./daily-value');
const redditRouter = require('./reddit');



// Routes below this point are unprotected or handle their own auth



router.get('/login', (req, res) => {
    // If already logged in, go to dashboard
    if (req.cookies && req.cookies.admin_jwt && verifyToken(req.cookies.admin_jwt)) {
        return res.redirect('/mission-control-x89');
    }
    res.send(renderLogin());
});

router.get('/manual', checkAuth, (req, res) => {
    res.send(renderManual());
});

router.post('/login', async (req, res) => {
    try {
        if (!req.body) {
            throw new Error('No body received in POST /login. Is urlencoded middleware configured?');
        }
        
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.send(renderLogin('Email and password are required.'));
        }

        const result = await pool.query('SELECT * FROM admin_users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (user && await comparePassword(password, user.password_hash)) {
            const token = generateToken(user);
            res.cookie('admin_jwt', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
            });
            res.redirect('/mission-control-x89');
        } else {
            res.send(renderLogin('Invalid email or password'));
        }
    } catch (err) {
        console.error('[CRITICAL] Login Route Error:', err);
        res.status(500).send(renderLogin(`System error: ${err.message}. Please contact the owner.`));
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('admin_jwt');
    res.json({ success: true });
});

router.post('/repair', checkAuth, ownerOnly, async (req, res) => {
    try {
        console.log('Manual DB Repair Triggered...');
        
        // 1. Repair Contacts
        await pool.query(`
            ALTER TABLE contacts 
            ADD COLUMN IF NOT EXISTS fit_score DECIMAL,
            ADD COLUMN IF NOT EXISTS engagement_rate DECIMAL,
            ADD COLUMN IF NOT EXISTS outreach_draft TEXT,
            ADD COLUMN IF NOT EXISTS scout_logged BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS fit_feedback TEXT
        `);

        // 3. Force Sync existing high-score leads (The "Rescue" Operation)
        await pool.query(`
            UPDATE contacts 
            SET scout_logged = TRUE 
            WHERE fit_score IS NOT NULL 
            AND scout_logged = FALSE
        `);

        res.json({ success: true, message: 'Database repaired and existing leads synchronized.' });
    } catch (err) {
        console.error('Repair Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/trigger', checkAuth, ownerOnly, async (req, res) => {
    try {
        console.log('Manual Scout Trigger received. Launching background process...');
        
        // 1. Respond immediately to avoid timeout
        res.json({ success: true, message: 'Scout has been sent into the field. Refresh in 60s.' });

        // 2. Run the agent in the background
        scoutAgentRun().then(() => {
            console.log('Background Scout Sweep completed successfully.');
        }).catch(err => {
            console.error('Background Scout Sweep failed:', err);
        });
        
    } catch (err) {
        console.error('Trigger Route Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/add-lead', checkAuth, async (req, res) => {
    try {
        const { handle, platform } = req.body;
        if (!handle || !platform) {
            return res.status(400).json({ success: false, error: 'Handle and platform required' });
        }

        // Clean handle
        const cleanHandle = handle.trim().replace(/^@/, '');
        
        await pool.query(`
            INSERT INTO contacts (
                handle, platform, pipeline_status, manually_added, scout_logged, created_at
            ) VALUES ($1, $2, 'discovery', TRUE, TRUE, NOW())
            ON CONFLICT (handle, platform) DO UPDATE SET 
                manually_added = TRUE, 
                scout_logged = TRUE,
                pipeline_status = CASE 
                    WHEN contacts.pipeline_status = 'rejected' THEN 'discovery' 
                    ELSE contacts.pipeline_status 
                END
        `, [cleanHandle, platform]);

        res.json({ success: true });
    } catch (err) {
        console.error('Add Lead Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/', checkAuth, async (req, res) => {
    try {
        // 1. Health Check (Checks for both columns and log table)
        const healthCheck = await pool.query(`
            SELECT table_name FROM information_schema.tables WHERE table_name = 'scout_logs'
        `);
        const colCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'scout_logged'
        `);
        
        const isDbReady = healthCheck.rows.length > 0 && colCheck.rows.length > 0;

        // 2. Total Scout Leads
        const scoutRes = await pool.query("SELECT COUNT(*) FROM contacts WHERE scout_logged = TRUE");
        
        // 3. Total Waitlist
        const waitlistRes = await pool.query("SELECT COUNT(*) FROM waitlist");
        
        // 4. Creator Applications
        const creatorRes = await pool.query("SELECT COUNT(*) FROM contacts WHERE scout_logged = FALSE");
        
        // 5. Offer Codes Left (by platform + type)
        const codesRes = await pool.query(`
            SELECT platform, type, COUNT(*) as count
            FROM offer_codes
            WHERE is_used = FALSE AND assigned_to_handle IS NULL
            GROUP BY platform, type
        `);
        const codesLeft = {
            ios: { trial: 0, lifetime: 0 },
            android: { trial: 0, lifetime: 0 },
        };
        codesRes.rows.forEach(r => {
            const platform = r.platform || 'ios';
            if (codesLeft[platform] && codesLeft[platform][r.type] !== undefined) {
                codesLeft[platform][r.type] = parseInt(r.count);
            }
        });
        
        // 6. Leads grouped by pipeline_status (Limited per column for performance)
        const leadsRes = await pool.query(`
            SELECT id, handle, platform, fit_score, niche, outreach_draft, post_url, pipeline_status, fit_feedback, reason, followers, followers_count, engagement_rate, bio, post_caption, freelancer_notes, manually_added
            FROM contacts 
            WHERE scout_logged = TRUE 
            ORDER BY manually_added DESC, fit_score DESC NULLS LAST, created_at DESC
        `);
        
        // 7. Get total counts for each status (for "Load More" logic)
        const countsRes = await pool.query(`
            SELECT pipeline_status, COUNT(*) as count 
            FROM contacts 
            WHERE scout_logged = TRUE 
            GROUP BY pipeline_status
        `);
        
        const totalCounts = {
            discovery: 0, researching: 0, approved: 0, outreach_sent: 0, rejected: 0
        };
        countsRes.rows.forEach(r => {
            const status = r.pipeline_status || 'discovery';
            if (totalCounts[status] !== undefined) {
                totalCounts[status] = parseInt(r.count);
            }
        });

        // Group leads (unlimited for client-side filtering)
        const pipelineStatus = {
            discovery: [], researching: [], approved: [], outreach_sent: [], rejected: []
        };
        
        leadsRes.rows.forEach(lead => {
            const status = lead.pipeline_status || 'discovery';
            if (pipelineStatus[status]) {
                pipelineStatus[status].push(lead);
            }
        });

        // 7. System Logs
        const logsRes = await pool.query(`
            SELECT message, created_at 
            FROM scout_logs 
            ORDER BY created_at DESC 
            LIMIT 10
        `);

        // Daily Value: most recent run summary (for status badge)
        let dailyValueLastRun = null;
        try {
            const lr = await pool.query(`
                SELECT message, created_at FROM scout_logs
                WHERE message LIKE 'Daily Value:%'
                ORDER BY created_at DESC LIMIT 1
            `);
            if (lr.rows[0]) dailyValueLastRun = lr.rows[0];
        } catch (err) {
            console.warn('Daily Value last run lookup skipped:', err.message);
        }

        // Daily Value: initial payload for the new board section
        let dailyValueByStatus = { new: [], drafted: [], replied: [], skipped: [] };
        try {
            const dvRes = await pool.query(`
                SELECT d.id, d.status, d.monitored_post_id, d.platform,
                       d.commenter_handle, d.comment_text, d.comment_posted_at,
                       d.reply_draft, d.status_changed_at,
                       m.account_handle, m.caption, m.thumbnail_url, m.post_url
                FROM digest_items d
                JOIN monitored_posts m ON m.id = d.monitored_post_id
                WHERE d.created_at > NOW() - INTERVAL '7 days'
                ORDER BY d.status_changed_at DESC
            `);
            for (const row of dvRes.rows) {
                const it = {
                    id: row.id, status: row.status, platform: row.platform,
                    commenter_handle: row.commenter_handle, comment_text: row.comment_text,
                    comment_posted_at: row.comment_posted_at, reply_draft: row.reply_draft,
                    post: {
                        account_handle: row.account_handle, caption: row.caption,
                        thumbnail_url: row.thumbnail_url, post_url: row.post_url,
                    },
                };
                if (dailyValueByStatus[row.status]) dailyValueByStatus[row.status].push(it);
            }
        } catch (err) {
            console.warn('Daily Value initial payload skipped:', err.message);
        }

        // Reddit Prospector: initial board payload + last run
        let redditByStatus = { pending: [], replied: [], needs_edit: [], dismissed: [] };
        let redditLastRun = null;
        try {
            const rr = await pool.query(`
                SELECT id, kind, subreddit, thread_id, parent_id, thread_url, author_handle,
                       title, body, posted_at, score, num_comments, audience,
                       draft_reply, draft_contains_pitch, status, reply_posted_at, status_changed_at
                FROM reddit_candidates
                WHERE created_at > NOW() - INTERVAL '7 days'
                ORDER BY status_changed_at DESC
            `);
            for (const row of rr.rows) {
                if (redditByStatus[row.status]) redditByStatus[row.status].push(row);
            }
        } catch (err) {
            console.warn('Reddit Prospector initial payload skipped:', err.message);
        }
        try {
            const lr = await pool.query(`
                SELECT message, created_at FROM scout_logs
                WHERE message LIKE 'Reddit:%'
                ORDER BY created_at DESC LIMIT 1
            `);
            if (lr.rows[0]) redditLastRun = lr.rows[0];
        } catch (err) {
            console.warn('Reddit Prospector last run lookup skipped:', err.message);
        }

        const stats = {
            isDbReady,
            scoutLeads: scoutRes.rows[0].count,
            waitlistTotal: waitlistRes.rows[0].count,
            creatorApps: creatorRes.rows[0].count,
            codesLeft,
            pipelineStatus,
            totalCounts,
            dailyValueByStatus,
            dailyValueLastRun,
            redditByStatus,
            redditLastRun,
            systemLogs: logsRes.rows[0] ? logsRes.rows : []
        };

        const html = renderAdminDashboard(stats, req.user.role);
        res.send(html);
    } catch (err) {
        console.error('Admin Dashboard Error:', err);
        res.status(500).send(`Admin Error: ${err.message}`);
    }
});

router.get('/api/leads-batch', checkAuth, async (req, res) => {
    try {
        const { status, offset, limit } = req.query;
        const targetStatus = status || 'discovery';
        const targetOffset = parseInt(offset) || 0;
        const targetLimit = parseInt(limit) || 50;

        const result = await pool.query(`
            SELECT id, handle, platform, fit_score, niche, outreach_draft, post_url, pipeline_status, fit_feedback, reason, followers, followers_count, engagement_rate, bio, post_caption, freelancer_notes, manually_added
            FROM contacts 
            WHERE scout_logged = TRUE AND (pipeline_status = $1 OR ($1 = 'discovery' AND pipeline_status IS NULL))
            ORDER BY manually_added DESC, fit_score DESC NULLS LAST, created_at DESC
            LIMIT $2 OFFSET $3
        `, [targetStatus, targetLimit, targetOffset]);

        res.json({ success: true, leads: result.rows });
    } catch (err) {
        console.error('API Leads Batch Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/test-seed', checkAuth, ownerOnly, async (req, res) => {
    try {
        console.log('Test Seed Triggered...');
        const testHandle = `scout_test_${Math.floor(Math.random() * 1000)}`;
        await pool.query(`
            INSERT INTO contacts (
                handle, platform, followers_count, niche, reason, 
                status, post_url, fit_score, scout_logged, created_at
            ) VALUES ($1, 'Instagram', 1500, 'Test', 'Diagnostic Mock Run', 'draft', 'http://test.com', 0.95, TRUE, NOW())
            ON CONFLICT (handle) DO UPDATE SET scout_logged = TRUE, created_at = NOW()
        `, [testHandle]);
        
        res.json({ success: true, message: `Mock lead @${testHandle} generated.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/debug', checkAuth, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM contacts ORDER BY created_at DESC LIMIT 50");
        res.json({ 
            success: true, 
            count: result.rowCount,
            data: result.rows 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/update-status', checkAuth, async (req, res) => {
    try {
        const { id, status } = req.body;
        const validStatuses = ['discovery', 'researching', 'approved', 'outreach_sent', 'rejected'];
        
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid pipeline status' });
        }
        
        await pool.query(`
            UPDATE contacts 
            SET pipeline_status = $1 
            WHERE id = $2
        `, [status, id]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Update Status Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/save-notes', checkAuth, async (req, res) => {
    try {
        const { id, notes } = req.body;
        if (!id) return res.status(400).json({ success: false, error: 'id required' });
        
        await pool.query('UPDATE contacts SET freelancer_notes = $1 WHERE id = $2', [notes || '', id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Save Notes Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/regenerate-draft', checkAuth, async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ success: false, error: 'id required' });

        // 1. Fetch lead data
        const leadRes = await pool.query('SELECT * FROM contacts WHERE id = $1', [id]);
        if (leadRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        const lead = leadRes.rows[0];

        // 2. Initialize ScoutAgent with current memory
        const { ScoutAgent } = require('../jobs/scout');
        const agent = new ScoutAgent();
        await agent.refreshDeepMemory();
        const memory = await agent.getFitMemory();

        // 3. Generate new draft
        const scoreData = { finalScore: lead.fit_score || 0.7 };
        const draft = await agent.generateStarkDraft(lead, scoreData, memory);

        // 4. Persist to DB
        await pool.query('UPDATE contacts SET outreach_draft = $1 WHERE id = $2', [draft, id]);

        res.json({ success: true, draft });
    } catch (err) {
        console.error('Regenerate Draft Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/claim-code', checkAuth, async (req, res) => {
    try {
        const { handle, rewardType, platform: rawPlatform } = req.body;
        if (!handle) return res.status(400).json({ success: false, error: 'Handle is required' });
        const type = rewardType || 'trial';
        const platform = ['ios', 'android'].includes(rawPlatform) ? rawPlatform : 'ios';

        // 1. Check if handle already has a code of this platform + type
        const existing = await pool.query(
            'SELECT code FROM offer_codes WHERE assigned_to_handle = $1 AND type = $2 AND platform = $3',
            [handle, type, platform]
        );
        if (existing.rows.length > 0) {
            return res.json({ success: true, code: existing.rows[0].code, alreadyAssigned: true });
        }

        // 2. Find and claim a new code of the requested platform + type
        const result = await pool.query(`
            UPDATE offer_codes
            SET assigned_to_handle = $1, assigned_at = NOW()
            WHERE id = (
                SELECT id FROM offer_codes
                WHERE is_used = FALSE AND assigned_to_handle IS NULL AND type = $2 AND platform = $3
                ORDER BY created_at ASC
                LIMIT 1
            )
            RETURNING code
        `, [handle, type, platform]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: `No available ${platform} ${type} promo codes found` });
        }

        res.json({ success: true, code: result.rows[0].code });
    } catch (err) {
        console.error('Claim Code Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.use('/daily-value', dailyValueRouter);
router.use('/reddit', redditRouter);

module.exports = router;
