const { generator, TECHNIQUES } = require('../server/jobs/video-generator');
const fs = require('fs-extra');
const path = require('path');

async function testPipeline() {
    console.log('--- Pipeline Verification: DRY RUN ---');
    console.log('1. Checking Canvas Rendering...');
    
    // Test render 30 frames (1 second) of Box Breathing
    const tech = TECHNIQUES['box'];
    const mockScript = { hook: 'TESTING SYSTEM', body: 'Test', caption: 'test', hashtags: [] };
    
    try {
        // We override the render duration for the test
        const originalDuration = 30; // 1 second
        
        console.log('Generating dry-run frames...');
        const framesDir = path.join(__dirname, '../tmp/test-frames');
        fs.ensureDirSync(framesDir);
        
        // Manual partial render for test
        const { createCanvas } = require('canvas');
        const canvas = createCanvas(1080, 1920);
        const ctx = canvas.getContext('2d');
        
        // Just render 3 frames to check buffer creation
        for(let i=0; i<3; i++) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0,0,1080,1920);
            generator.drawOrb(ctx, 540, 960, 'INHALE', 0.5);
            const buffer = canvas.toBuffer('image/png');
            await fs.writeFile(path.join(framesDir, `frame-000${i}.png`), buffer);
        }
        console.log('✔ Canvas Rendering: OK');

        console.log('2. Testing FFmpeg Assembly...');
        const ffmpeg = require('fluent-ffmpeg');
        const testOutput = path.join(__dirname, '../output/videos/system-test.mp4');
        fs.ensureDirSync(path.dirname(testOutput));

        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(path.join(framesDir, 'frame-%04d.png'))
                .inputFPS(30)
                .videoCodec('libx264')
                .outputOptions(['-pix_fmt yuv420p', '-t 0.1']) // Very short test
                .on('end', resolve)
                .on('error', reject)
                .save(testOutput);
        });
        
        console.log('✔ FFmpeg Assembly: OK');
        console.log('--- SYSTEM STATUS: READY ---');
        console.log(`Test file created at: ${testOutput}`);
        
        // Cleanup test frames
        await fs.remove(framesDir);
        
    } catch (err) {
        console.error('✘ Pipeline test failed:', err);
        process.exit(1);
    }
}

testPipeline();
