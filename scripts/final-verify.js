const { ScoutAgent } = require('../server/jobs/scout');

async function finalTest() {
  console.log('🚀 Running Final Verified Multi-Language Sweep...');
  const agent = new ScoutAgent();
  agent.hashtags = ['pust', 'bienestar']; // Forced for verification (Norwegian & Spanish)
  await agent.run();
  console.log('✅ Done. Check docs/scout_finds.md');
}

finalTest();
