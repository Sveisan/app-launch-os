const cron = require('node-cron');
const { generateContent } = require('./content-generator');
const { scoutAgentRun } = require('./scout');
const { runDailyValue } = require('./daily-value');
const { runRedditProspector } = require('./reddit-prospector');
const { pool } = require('../db/index');
const config = require('../../config/app');
const QUEUE = require('./topic-queue');

// Every Monday at 9am
cron.schedule('0 9 * * 1', async () => {
    console.log('Running weekly content generation job...');
    try {
        const existing = await pool.query('SELECT slug FROM content');
        const done = new Set(existing.rows.map(r => r.slug));
        const next = QUEUE.find(t => !done.has(t.slug));
        
        if (!next) {
            console.log('All topics generated. No new content needed.');
            return;
        }
        
        await generateContent(next);
    } catch (err) {
        console.error('Scheduler error:', err);
    }
});

// Scout Agent Profile: Every hour
cron.schedule('0 * * * *', async () => {
    console.log('Scout Agent waking up for hourly sweep...');
    try {
        await scoutAgentRun();
    } catch (err) {
        console.error('Scout Agent Error:', err);
    }
});

// Daily Value: nightly comment digest
cron.schedule(config.digest.cron, async () => {
    console.log('Daily Value: nightly run starting...');
    try {
        await runDailyValue();
    } catch (err) {
        console.error('Daily Value job error:', err);
    }
});

// Reddit Prospector: every 6h
cron.schedule(config.reddit.cron, async () => {
    console.log('Reddit Prospector: run starting...');
    try {
        await runRedditProspector();
    } catch (err) {
        console.error('Reddit Prospector job error:', err);
    }
});

console.log('Content scheduler initialized. Scout Agent active. Daily Value cron registered. Reddit Prospector cron registered.');
