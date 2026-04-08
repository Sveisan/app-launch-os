const { scoutAgentRun } = require('../server/jobs/scout');

/**
 * Manual Trigger Script for the Scout Agent.
 * Runs one full cycle of the Sherlock/Stark logic.
 */
async function triggerNow() {
  console.log('🚀 Manual Scout Trigger Activated...');
  
  try {
    await scoutAgentRun();
    console.log('✅ Manual Sweep Complete. Check docs/scout_drafts.md for results.');
  } catch (err) {
    console.error('❌ Scout Trigger Failed:', err);
    console.log('Note: Ensure your local .env has APIFY_TOKEN and ANTHROPIC_API_KEY if running locally.');
  }
}

triggerNow();
