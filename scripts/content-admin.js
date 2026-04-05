require('dotenv').config();
const { pool } = require('../server/db/index');
const { generateContent } = require('../server/jobs/content-generator');
const QUEUE = require('../server/jobs/topic-queue');
const { renderTechniquePage, renderUseCasePage } = require('../server/templates/content');

const cmd = process.argv[2];
const arg = process.argv[3];

async function main() {
  if (cmd === 'list') {
    const res = await pool.query('SELECT slug, type, published, created_at FROM content ORDER BY created_at DESC');
    console.table(res.rows);
    process.exit(0);
  }
  
  if (cmd === 'publish' || cmd === 'unpublish') {
    if (!arg) {
      console.error('Provide a slug');
      process.exit(1);
    }
    const isPub = cmd === 'publish';
    await pool.query('UPDATE content SET published = $1, updated_at = NOW() WHERE slug = $2', [isPub, arg]);
    console.log(`Set ${arg} published = ${isPub}`);
    process.exit(0);
  }
  
  if (cmd === 'generate') {
    if (!arg) {
      console.error('Provide a slug from the topic queue');
      process.exit(1);
    }
    const topic = QUEUE.find(t => t.slug === arg);
    if (!topic) {
      console.error('Topic not found in queue');
      process.exit(1);
    }
    await generateContent(topic);
    process.exit(0);
  }
  
  if (cmd === 'generate-all') {
    const existing = await pool.query('SELECT slug FROM content');
    const existingSlugs = existing.rows.map(r => r.slug);
    
    const remaining = QUEUE.filter(t => !existingSlugs.includes(t.slug));
    console.log(`Found ${remaining.length} topics left to generate and publish.`);
    
    for (const [i, topic] of remaining.entries()) {
      console.log(`[${i+1}/${remaining.length}] Building and publishing: ${topic.slug}...`);
      const success = await generateContent(topic);
      if (success) {
        await pool.query('UPDATE content SET published = TRUE, updated_at = NOW() WHERE slug = $1', [topic.slug]);
        console.log(`  -> Successfully published ${topic.slug}`);
      } else {
        console.error(`  -> FAILED to generate ${topic.slug}`);
      }
      
      if (i < remaining.length - 1) {
        console.log('  -> Waiting 25 seconds to respect Anthropic AI rate limits...');
        await new Promise(resolve => setTimeout(resolve, 25000));
      }
    }
    console.log('BATCH COMPLETE! All remaining articles are live.');
    process.exit(0);
  }

  
  if (cmd === 'preview') {
    if (!arg) {
      console.error('Provide a slug');
      process.exit(1);
    }
    const res = await pool.query('SELECT * FROM content WHERE slug = $1', [arg]);
    if (res.rows.length === 0) {
      console.error('Draft not found');
      process.exit(1);
    }
    const row = res.rows[0];
    const html = (row.type === 'use-case' || row.type === 'faq-cluster') ? renderUseCasePage(row) : renderTechniquePage(row);
    console.log('--- HTML PREVIEW ---');
    console.log(html);
    process.exit(0);
  }
  
  console.log('Valid commands: list, publish <slug>, unpublish <slug>, generate <slug>, preview <slug>');
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
