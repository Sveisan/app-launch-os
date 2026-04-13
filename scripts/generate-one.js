const { generator, TECHNIQUES } = require('../server/jobs/video-generator');

async function run() {
    console.log('--- BREATHE VIDEO STUDIO : SINGLE RENDER ---');
    console.log('Target: Box Breathing');
    
    try {
        const techKey = 'box';
        const tech = TECHNIQUES[techKey];
        
        console.log('1. Prompting Claude for script...');
        const script = await generator.generateScript(tech);
        console.log('   Hook:', script.hook);
        
        console.log('2. Requesting Liam voiceover from ElevenLabs...');
        const audioPath = await generator.generateVoice(techKey, script.body);
        console.log('   Audio saved to:', audioPath);
        
        console.log('3. Fetching Generative AI Background...');
        const bgPath = await generator.generateBackgroundVideo(techKey, script.scenePrompt);
        console.log('   Background saved to:', bgPath);
        
        console.log('4. Rendering Transparent UI Overlay (Canvas)...');
        const framesDir = await generator.renderFrames(techKey, tech, script);
        console.log('   Frames rendered to:', framesDir);
        
        console.log('5. Compositing Video Layers (FFmpeg)...');
        const videoPath = await generator.assembleVideo(techKey, framesDir, audioPath, bgPath);
        
        console.log('--- SUCCESS ---');
        console.log(`Video ready: ${videoPath}`);
        
    } catch (err) {
        console.error('Extraction/Generation failed:', err);
    }
}

run();
