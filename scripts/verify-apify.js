const { ApifyClient } = require('apify-client');
require('dotenv').config();

const client = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

async function verify() {
    console.log('🔍 Verifying Apify Token and Plan...');
    try {
        const userInfo = await client.user().get();
        console.log('✅ Token is valid.');
        console.log(`👤 User: ${userInfo.username} (#${userInfo.id})`);
        
        // This is a rough way to check balance/plan via simple actor list or similar
        // since the user endpoint doesn't always show credit balance directly in v2
        console.log('Checking recent runs...');
        const runs = await client.runs().list({ limit: 5 });
        console.log(`Found ${runs.items.length} recent runs.`);
        
        console.log('\n🚀 Connectivity Test: Attempting a zero-cost list of hashtags...');
        // We'll just try to list one dataset to prove we can talk to the API
        const datasets = await client.datasets().list({ limit: 1 });
        console.log('✅ Connectivity test passed.');
        
    } catch (err) {
        console.error('❌ Apify Verification Failed:', err.message);
        if (err.message.includes('not found')) {
            console.log('Hint: Your APIFY_API_TOKEN might be incorrect.');
        }
    }
}

verify();
