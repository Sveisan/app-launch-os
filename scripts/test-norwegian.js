const { ScoutAgent } = require('../server/jobs/scout');

async function testNorwegian() {
  console.log('🇳🇴 Testing Norwegian Discovery...');
  const agent = new ScoutAgent();
  agent.hashtags = ['pusteteknikk']; // Force Norwegian
  await agent.run();
  console.log('Done. Check docs/scout_finds.md');
}

testNorwegian();
