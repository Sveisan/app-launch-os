require('dotenv').config();
const { generator } = require('../server/jobs/video-generator');

async function runAll() {
    console.log('\n--- BREATHE VIDEO STUDIO : BATCH GENERATOR ---');
    console.log('Initiating generation pipeline for all techniques...\n');

    try {
        const results = await generator.generateAll((techKey, status) => {
            console.log(`[${techKey.toUpperCase()}] > ${status}`);
        });

        console.log('\n--- BATCH COMPLETE ---');
        console.log(`Successfully generated ${results.length} videos.`);
        for (const res of results) {
            console.log(`- ${res.techKey}: ${res.videoPath}`);
        }
        process.exit(0);
    } catch (err) {
        console.error('\n--- BATCH FAILED ---');
        console.error(err);
        process.exit(1);
    }
}

runAll();
