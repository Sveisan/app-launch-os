const { ApifyClient } = require('apify-client');
require('dotenv').config();

const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN,
});

const hashtag = 'breathwork'; // Test hashtag

async function testScrapers() {
  console.log(`🔍 Testing scrapers for #${hashtag}...`);
  
  if (!process.env.APIFY_API_TOKEN && !process.env.APIFY_TOKEN) {
    console.error('❌ Error: APIFY_API_TOKEN is missing in .env');
    return;
  }

  try {
    // 1. TikTok Test
    console.log('--- TikTok (clockworks/tiktok-scraper) ---');
    const ttRun = await apifyClient.actor("clockworks/tiktok-scraper").call({
      hashtags: [hashtag],
      resultsPerPage: 5,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false
    });
    const { items: ttItems } = await apifyClient.dataset(ttRun.defaultDatasetId).listItems();
    console.log(`Found ${ttItems.length} TikTok items.`);
    if (ttItems.length > 0) {
      console.log('Sample TikTok handle:', ttItems[0].author?.uniqueId);
    }

    // 2. Instagram Test
    console.log('--- Instagram (apify/instagram-hashtag-scraper) ---');
    const igRun = await apifyClient.actor("apify/instagram-hashtag-scraper").call({
      hashtags: [hashtag],
      resultsLimit: 5
    });
    const { items: igItems } = await apifyClient.dataset(igRun.defaultDatasetId).listItems();
    console.log(`Found ${igItems.length} Instagram items.`);
    if (igItems.length > 0) {
      console.log('Sample Instagram handle:', igItems[0].ownerUsername || igItems[0].ownerId);
    }

  } catch (err) {
    console.error('❌ Scraper Test Error:', err.message);
  }
}

testScrapers();
