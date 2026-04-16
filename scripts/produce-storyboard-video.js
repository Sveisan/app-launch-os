const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs-extra');
const { createCanvas } = require('canvas');

// Paths
const ffmpegPath = '/opt/homebrew/bin/ffmpeg';
ffmpeg.setFfmpegPath(ffmpegPath);

const ASSETS_DIR = path.join(__dirname, '../assets/images/storyboard_v1');
const AUDIO_DIR = path.join(__dirname, '../tmp/audio');
const TMP_DIR = path.join(__dirname, '../tmp/production');
const OUTPUT_PATH = path.join(__dirname, '../output/storyboard_v1.mp4');

const WIDTH = 1080;
const HEIGHT = 1920;

async function createTextFrame(text, filename, bgColor = 'black', textColor = 'white', fontSize = 120) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    
    ctx.fillStyle = textColor;
    ctx.font = `${fontSize}px Arial`; // Using Arial as a default
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Simple wrap text
    const words = text.split(' ');
    let line = '';
    let y = HEIGHT / 2;
    const lineHeight = fontSize * 1.2;
    
    const lines = [];
    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > WIDTH - 160 && i > 0) {
            lines.push(line);
            line = words[i] + ' ';
        } else {
            line = testLine;
        }
    }
    lines.push(line);
    
    y -= (lines.length - 1) * lineHeight / 2;
    
    for (const l of lines) {
        ctx.fillText(l.trim(), WIDTH / 2, y);
        y += lineHeight;
    }
    
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(path.join(TMP_DIR, filename), buffer);
}

async function assemble() {
    await fs.ensureDir(TMP_DIR);
    await fs.ensureDir(path.dirname(OUTPUT_PATH));
    
    console.log("Creating text frames...");
    await createTextFrame("5", "sc2_frame.png", "black", "white", 300);
    await createTextFrame("It's shocking the results you get once you know how to breathe properly.", "tagline.png", "rgba(0,0,0,0.4)", "white", 64);
    
    console.log("Assembling Scene 1 (The Hook)...");
    // 5 rapid cuts, 0.8s each = 4s total (The storyboard says 5 cuts over 5s, but 0.8s * 5 = 4s. I'll use 1s each to fill 5s).
    // Let's stick to 1s each for a 5s scene.
    
    const lutFilter = 'eq=saturation=1.15:contrast=1.1:brightness=0.0,colorbalance=rs=0.1:gs=0.05:bs=-0.1:rm=0.15:gm=0.07:bm=-0.15:rh=0.1:gh=0.05:bh=-0.1';
    
    const command = ffmpeg();
    
    // Inputs
    // Sc 1: 5 shock faces
    for (let i = 1; i <= 5; i++) {
        command.input(path.join(ASSETS_DIR, `face_shock_${i}.png`)).inputOptions(['-loop', '1']);
    }
    // Sc 2: Black screen
    command.input(path.join(TMP_DIR, 'sc2_frame.png')).inputOptions(['-loop', '1']);
    // Sc 3: 3 calm faces
    for (let i = 1; i <= 3; i++) {
        command.input(path.join(ASSETS_DIR, `face_calm_${i}.png`)).inputOptions(['-loop', '1']);
    }
    // Sc 4: Tagline overlay on calm face 3
    command.input(path.join(ASSETS_DIR, `face_calm_3.png`)).inputOptions(['-loop', '1']);
    command.input(path.join(TMP_DIR, 'tagline.png')).inputOptions(['-loop', '1']); // Layered on top
    
    // Audio Inputs (Index 11, 12, 13)
    command.input(path.join(AUDIO_DIR, 'vo_sc2.mp3')); // sc2: 5-7s
    command.input(path.join(AUDIO_DIR, 'vo_sc3.mp3')); // sc3: 7-16s
    command.input(path.join(AUDIO_DIR, 'vo_sc4.mp3')); // sc4: 16-20s

    // Filter Complex
    command.complexFilter([
        // Scale and Trim all inputs to set exact durations
        '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=duration=1,setpts=PTS-STARTPTS[v0]',
        '[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=duration=1,setpts=PTS-STARTPTS[v1]',
        '[2:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=duration=1,setpts=PTS-STARTPTS[v2]',
        '[3:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=duration=1,setpts=PTS-STARTPTS[v3]',
        '[4:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=duration=1,setpts=PTS-STARTPTS[v4]',
        '[5:v]scale=1080:1920,setsar=1,trim=duration=2,setpts=PTS-STARTPTS[v5]', // Black Screen
        '[6:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=duration=4,setpts=PTS-STARTPTS[v6]', // 1s overlap for xfade
        '[7:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=duration=4,setpts=PTS-STARTPTS[v7]',
        '[8:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=duration=4,setpts=PTS-STARTPTS[v8]',
        '[9:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=duration=4,setpts=PTS-STARTPTS[v9]',
        '[10:v]scale=1080:1920,setsar=1,trim=duration=4,setpts=PTS-STARTPTS[v10]', // Tagline overlay
        
        // Scene 1: Concat 5 shots (1s each)
        '[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0[sc1]',
        
        // Scene 3: Slow Dissolves (xfade)
        // Offset 3s because each clip is 4s (3s effective + 1s crossfade)
        '[v6][v7]xfade=transition=fade:duration=1:offset=3[sc3_a]',
        '[sc3_a][v8]xfade=transition=fade:duration=1:offset=6[sc3_v]',
        
        // Scene 4: Overlay tagline on v9
        '[v9][v10]overlay=0:0[sc4_v]',
        
        // Final Concat
        '[sc1][v5][sc3_v][sc4_v]concat=n=4:v=1:a=0,format=yuv420p,' + lutFilter + '[outv]',
        
        // Audio Mixing
        '[11:a]adelay=5000[a2]', // Sc 2 starts at 5s
        '[12:a]adelay=7000[a3]', // Sc 3 starts at 7s
        '[13:a]adelay=16000[a4]', // Sc 4 starts at 16s
        '[a2][a3][a4]amix=inputs=3[outa]'
    ], ['outv', 'outa']);

    command
        .outputOptions([
            '-t 20',
            '-pix_fmt yuv420p'
        ])
        .on('start', (cmd) => console.log("FFmpeg command:", cmd))
        .on('progress', (p) => console.log(`Progress: ${p.percent || 0}%`))
        .on('end', () => console.log("Production Complete! -> " + OUTPUT_PATH))
        .on('error', (err) => console.error("FFmpeg Error:", err.message))
        .save(OUTPUT_PATH);
}

assemble().catch(console.error);
