const cron = require('node-cron');
const { generateContent } = require('./content-generator');
const { pool } = require('../db/index');
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

console.log('Content scheduler initialized.');
