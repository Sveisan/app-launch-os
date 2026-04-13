const fs = require('fs-extra');
const path = require('path');
const { createCanvas, registerFont } = require('canvas');
const ffmpeg = require('fluent-ffmpeg');
const { Anthropic } = require('@anthropic-ai/sdk');
const axios = require('axios');
require('dotenv').config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Technique metadata
// Campaign metadata (Motivational Sequences)
const CAMPAIGNS = {
    'master': { 
        name: 'The Master', 
        sequence: [
            "We all breathe.",
            "But almost no one breathes correctly.",
            "The difference shows up in your sleep, your focus, and your stress levels.",
            "Become one of them."
        ],
        context: 'General Motivation'
    },
    'anchor': { 
        name: 'The Anchor', 
        sequence: [
            "Your mind follows your breath.",
            "When you slow your exhale, you signal safety to your nervous system. Cortisol drops, heart rate slows, the noise quiets.",
            "Practicing 5 minutes a day drastically reduces anxiety.",
            "Anchor yourself."
        ],
        context: 'Anxiety Reduction Focus'
    },
    'edge': { 
        name: 'The Edge', 
        sequence: [
            "Focus isn't forced. It's found.",
            "A few minutes of controlled breathing floods your brain with oxygen, clears the fog, and sharpens your focus.",
            "When focus slips, don't chase it.",
            "Breathe it back."
        ],
        context: 'Cognitive Enhancement'
    }
};

class VideoGenerator {
    constructor() {
        this.outputDir = path.join(__dirname, '../../output/videos');
        this.tmpDir = path.join(__dirname, '../../tmp/video-gen');
        fs.ensureDirSync(this.outputDir);
        fs.ensureDirSync(this.tmpDir);
        
        // Register font if available
        const fontPath = path.join(__dirname, '../../public/fonts/Outfit-Medium.ttf');
        if (fs.existsSync(fontPath)) {
            registerFont(fontPath, { family: 'Outfit' });
        }
    }

    async generateAll(onProgress) {
        const results = [];
        const techs = Object.keys(CAMPAIGNS); 
        
        for (let i = 0; i < techs.length; i++) {
            const techKey = techs[i];
            const tech = CAMPAIGNS[techKey];
            
            try {
                if (onProgress) onProgress(techKey, 'Scripting');
                const script = await this.generateScript(tech);
                
                // Audio synthesis is skipped for visual-only draft
                if (onProgress) onProgress(techKey, 'Resolving Background');
                const bgPath = await this.generateBackgroundVideo(techKey, script.scenePrompt);
                
                if (onProgress) onProgress(techKey, 'Rendering Sequence Overlay');
                const framesDir = await this.renderFrames(techKey, tech, script);
                
                if (onProgress) onProgress(techKey, 'Compositing');
                const videoPath = await this.assembleVideo(techKey, framesDir, null, bgPath);
                
                // Save caption
                const captionText = `${script.hook}\n\n${script.caption}\n\n${script.hashtags.join(' ')}`;
                await fs.writeFile(path.join(this.outputDir, `${techKey}.caption.txt`), captionText);

                results.push({ techKey, videoPath, captionText });
                if (onProgress) onProgress(techKey, 'Done');
            } catch (err) {
                console.error(`Error generating ${techKey}:`, err);
                if (onProgress) onProgress(techKey, 'Error: ' + err.message);
            }
        }
        return results;
    }

    async generateScript(tech) {
        // Bypass Claude for now, use the predefined sequences
        return {
            hook: "BREATHE", 
            body: tech.sequence.join(' '),
            caption: `${tech.name}: ${tech.context}. ${tech.sequence.join(' ')}`,
            hashtags: ['#breathwork', '#quietluxury', '#focus', '#calm', '#health'],
            scenePrompt: "Bypass generative background, using local 35mm Liquid Space Ocean."
        };
    }

    async generateVoice(techKey, text) {
        // Mock method retained for API compatibility, but not used in visual-only mode
        return null;
    }

    async generateBackgroundVideo(techKey, scenePrompt) {
        const bgPath = path.join(this.tmpDir, `${techKey}-bg.mp4`);
        if (fs.existsSync(bgPath)) return bgPath;
        
        console.log(`[Vibe Index] Resolving visually aligned background for: ${techKey}`);
        
        try {
            const indexFile = path.join(__dirname, '../../assets/videos/vibe_index.json');
            if (!fs.existsSync(indexFile)) throw new Error("vibe_index.json not found");
            
            const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
            const brollFiles = Object.keys(indexData);
            
            if (brollFiles.length === 0) throw new Error("No b-roll entries in vibe_index");
            
            const selectedClip = brollFiles[Math.floor(Math.random() * brollFiles.length)];
            const sourceVideo = path.join(__dirname, '../../assets/videos/b-roll', selectedClip);
            
            if (!fs.existsSync(sourceVideo)) throw new Error(`B-roll file missing: ${selectedClip}`);
            
            console.log(`[Vibe Index] Selected "${selectedClip}" to pair with ${techKey}`);
            fs.copyFileSync(sourceVideo, bgPath);
            
            return bgPath;
        } catch (err) {
            console.warn(`[Vibe Index Warning] ${err.message}. Defaulting to generic...`);
            const fallback = path.join(__dirname, '../../assets/videos/b-roll/teal_aura_v2.mp4');
            if (fs.existsSync(fallback)) {
                fs.copyFileSync(fallback, bgPath);
                return bgPath;
            }
            throw new Error("No background assets found at all.");
        }
    }

    async renderFrames(techKey, tech, script) {
        const framesDir = path.join(this.tmpDir, techKey, 'frames');
        fs.ensureDirSync(framesDir);
        
        const width = 1080;
        const height = 1920;
        const fps = 30;
        const duration = 30;
        const totalFrames = duration * fps;
        
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Pre-generate stars for PARALLAX consistency
        const stars = [];
        const layers = [
            { count: 300, size: [0.2, 0.8], speed: 0.2, opacity: [0.1, 0.4] }, // Background (Far)
            { count: 150, size: [0.8, 1.5], speed: 0.5, opacity: [0.4, 0.7] }, // Midground
            { count: 50,  size: [1.5, 2.5], speed: 1.2, opacity: [0.6, 0.9] }  // Foreground (Close)
        ];
        
        layers.forEach((layer, layerIdx) => {
            for (let i = 0; i < layer.count; i++) {
                stars.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    size: Math.random() * (layer.size[1] - layer.size[0]) + layer.size[0],
                    opacity: Math.random() * (layer.opacity[1] - layer.opacity[0]) + layer.opacity[0],
                    speed: layer.speed,
                    layer: layerIdx,
                    twinkle: Math.random() * 0.08 + 0.02
                });
            }
        });
        
        // "Coherent" Constant Breathing Rhythm (6s inhale, 6s exhale loop)
        const cycleDuration = 12.0;

        for (let frame = 0; frame < totalFrames; frame++) {
            const time = frame / fps;
            const cycleTime = time % cycleDuration;
            
            // Continuous sine wave from 0 to 1 and back
            const rawProgress = cycleTime / cycleDuration;
            const smoothProgress = 0.5 * (1 - Math.cos(rawProgress * Math.PI * 2));
            
            // Clear Frame for Transparency
            ctx.clearRect(0, 0, width, height);
            
            // 0. DRAW LIQUID SPACE OCEAN BACKGROUND
            this.drawLiquidUniverseBackground(ctx, width, height, frame, stars);
            
            // Refined Vignette for Ocean depth
            const vignette = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, height);
            vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
            vignette.addColorStop(0.6, 'rgba(0, 0, 0, 0.2)');
            vignette.addColorStop(1, 'rgba(10, 0, 20, 0.6)'); // Hints at deep violet depths
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, width, height);
            
            // 1. Draw Eternal Breathing Orb (Hypnotic, Continuous)
            this.drawOrb(ctx, width/2, height/2, smoothProgress);
            
            // 2. Fading Text Narrative Sequence
            // Spread sequence evenly across 30seconds 
            const segmentTime = duration / tech.sequence.length;
            const seqIndex = Math.min(Math.floor(time / segmentTime), tech.sequence.length - 1);
            const timeInSeq = time % segmentTime;
            
            // Fade in over 1.5s, fade out over 1.5s at end of segment
            let textAlpha = 1.0;
            if (timeInSeq < 1.5) {
                textAlpha = timeInSeq / 1.5;
            } else if (timeInSeq > segmentTime - 1.5) {
                textAlpha = (segmentTime - timeInSeq) / 1.5;
            }

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 30;
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            
            // Split line into multiple if it's too long
            const words = tech.sequence[seqIndex].split(' ');
            let line = '';
            let yOffset = 250; // Positioned securely above the orb's max radius
            const lineHeight = 55;
            
            ctx.font = '300 48px Outfit';
            ctx.fillStyle = `rgba(255, 255, 255, ${textAlpha})`;
            
            for (let w = 0; w < words.length; w++) {
                const testLine = line + words[w] + ' ';
                const metrics = ctx.measureText(testLine);
                if (metrics.width > width - 160 && w > 0) {
                    ctx.fillText(line, width/2, yOffset);
                    line = words[w] + ' ';
                    yOffset += lineHeight;
                } else {
                    line = testLine;
                }
            }
            ctx.fillText(line, width/2, yOffset);
            ctx.shadowBlur = 0;
            
            const frameName = `frame-${frame.toString().padStart(4, '0')}.png`;
            const buffer = canvas.toBuffer('image/png');
            await fs.writeFile(path.join(framesDir, frameName), buffer);
        }
        
        return framesDir;
    }

    drawLiquidUniverseBackground(ctx, width, height, frame, stars) {
        // Deep Space Base (Rich Deep Depth)
        ctx.fillStyle = '#020108';
        ctx.fillRect(0, 0, width, height);

        // 1. ORGANIC SOFT-BODY NEBULAE
        const time = frame * 0.01;
        
        const drawCloud = (x, y, radius, color, seed) => {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            // Use sine-driven drift for "liquid" gas movement
            const nx = x + Math.sin(time * 0.5 + seed) * 150;
            const ny = y + Math.cos(time * 0.3 + seed) * 100;
            
            const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, radius);
            grad.addColorStop(0, color);
            grad.addColorStop(0.5, color.replace(/[\d.]+\)$/, '0.05)'));
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(nx, ny, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };

        // Layered clusters for a "Real" nebula look
        // Magenta/Violet core clusters
        drawCloud(width * 0.7, height * 0.8, height * 0.6, 'rgba(180, 0, 180, 0.12)', 1.2);
        drawCloud(width * 0.3, height * 0.7, height * 0.5, 'rgba(120, 0, 180, 0.08)', 2.5);
        
        // Brand Teal depth
        drawCloud(width * 0.2, height * 0.3, height * 0.7, 'rgba(44, 120, 115, 0.1)', 3.8);

        // 2. DEPTH-OF-FIELD STARFIELD
        stars.forEach(star => {
            const driftX = (frame * star.speed * 0.4) % width;
            let sx = star.x + driftX;
            if (sx > width) sx -= width;

            const twinkle = Math.sin(frame * star.twinkle) * 0.3;
            
            // Photorealistic Star: Outer layers are slightly blurred (DOF)
            if (star.layer < 2) {
                ctx.shadowBlur = star.layer === 0 ? 4 : 2;
                ctx.shadowColor = 'white';
            } else {
                ctx.shadowBlur = 0;
            }
            
            ctx.globalAlpha = Math.max(0.1, Math.min(1, star.opacity + twinkle));
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(sx, star.y, star.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });
        
        // 3. SHOOTING STARS (Immersive atmosphere)
        ctx.save();
        const shootingStarCycle = (time * 0.4) % 15; // Cycle roughly every 37 seconds
        if (shootingStarCycle > 4 && shootingStarCycle < 5) { // Visible for ~2.5s
            const localProgress = shootingStarCycle - 4;
            // Draw a shooting star dashing across the upper layer
            const sx = width * 1.2 - (localProgress * width * 1.5);
            const sy = height * 0.1 + (localProgress * height * 0.4);
            
            ctx.globalCompositeOperation = 'screen';
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + 150, sy - 60);
            const grad = ctx.createLinearGradient(sx, sy, sx + 150, sy - 60);
            grad.addColorStop(0, `rgba(255, 255, 255, ${Math.max(0, 1 - localProgress)})`);
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        ctx.restore();
        
        ctx.globalAlpha = 1.0;
    }

    applyCinematicPostProcessing(ctx, width, height, frame) {
        // 1. 35mm FILM GRAIN (Procedural Tactile Texture)
        ctx.save();
        ctx.globalAlpha = 0.05; // Slightly more presence for 35mm
        for (let i = 0; i < 6000; i++) {
            const gx = Math.random() * width;
            const gy = Math.random() * height;
            // Mixed sizes for organic grain "clusters"
            const size = Math.random() > 0.8 ? 2 : 1; 
            ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
            ctx.fillRect(gx, gy, size, size);
        }
        ctx.restore();

        // 2. CHROMATIC ABERRATION (Subtle color fringe at edges)
        // We simulate this by drawing a very faint offset color pass
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.03;
        ctx.drawImage(ctx.canvas, 2, 0); // Red shift pass
        ctx.globalAlpha = 0.03;
        ctx.drawImage(ctx.canvas, -2, 0); // Blue shift pass
        ctx.restore();
    }

    drawOrb(ctx, x, y, progress) {
        const sizeBase = 280; // Larger for the eternal flow
        
        // Progress goes 0 to 1. Scale smoothly from 1.0 -> 1.5 -> 1.0 over the cycle
        const scale = 1.0 + (progress * 0.5);

        const radius = sizeBase * scale;

        // 1. ATMOSPHERIC SOUL GLOW (Gaseous bio-field)
        const auraAlpha = 0.1 + (Math.sin(progress * Math.PI) * 0.05);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const aura = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.5);
        aura.addColorStop(0, `rgba(82, 171, 152, ${auraAlpha})`);
        aura.addColorStop(0.5, `rgba(44, 120, 115, ${auraAlpha * 0.3})`);
        aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(x, y, radius * 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 2. THE LIQUID UNIVERSE CORE (The Planet)
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip(); // Mask everything inside the planet shell

        // Swirling internal nebulae (Planet texture)
        const rot = progress * 0.2;
        ctx.translate(x, y);
        ctx.rotate(rot);
        
        const coreTexture = ctx.createLinearGradient(-radius, -radius, radius, radius);
        coreTexture.addColorStop(0, '#000000');
        coreTexture.addColorStop(0.4, '#1a1a2e');
        coreTexture.addColorStop(0.6, '#2C7873');
        coreTexture.addColorStop(0.8, '#52AB98');
        coreTexture.addColorStop(1, '#ffffff');
        ctx.fillStyle = coreTexture;
        ctx.fillRect(-radius * 2, -radius * 2, radius * 4, radius * 4);
        
        // Inner depth shadowing
        const innerShadow = ctx.createRadialGradient(0, 0, radius * 0.4, 0, 0, radius);
        innerShadow.addColorStop(0, 'rgba(0,0,0,0)');
        innerShadow.addColorStop(1, 'rgba(0,0,0,0.8)');
        ctx.fillStyle = innerShadow;
        ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
        
        ctx.restore();

        // 3. ULTRA-GLASS REFRACTIVE SHELL
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        
        // Rim Highlight (Subtle Brand Color instead of grey/white)
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        const rim = ctx.createRadialGradient(x, y, radius * 0.8, x, y, radius);
        rim.addColorStop(0, 'rgba(82, 171, 152, 0)'); // Brand Teal inner fade
        rim.addColorStop(1, 'rgba(82, 171, 152, 0.4)'); // Subtle Teal outer edge
        ctx.fillStyle = rim;
        ctx.fill();

        // Specular Glint (The Shine)
        const glint = ctx.createRadialGradient(x - radius * 0.4, y - radius * 0.4, 0, x - radius * 0.4, y - radius * 0.4, radius * 0.6);
        glint.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        glint.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glint;
        ctx.fill();
        
        // 4. OCEAN REFLECTION (Bottom Lighting)
        const reflect = ctx.createLinearGradient(x, y + radius * 0.5, x, y + radius);
        reflect.addColorStop(0, 'rgba(180, 0, 180, 0)');
        reflect.addColorStop(1, 'rgba(180, 0, 180, 0.25)'); // Magenta bottom glow
        ctx.fillStyle = reflect;
        ctx.fill();
        
        ctx.restore();
    }

    async assembleVideo(techKey, framesDir, audioPath, bgPath) {
        return new Promise((resolve, reject) => {
            const outputPath = path.join(this.outputDir, `${techKey}.mp4`);
            ffmpeg()
                .input(bgPath)
                .inputOptions(['-stream_loop', '-1'])
                .input(path.join(framesDir, 'frame-%04d.png'))
                .inputFPS(30)
                .complexFilter([
                    '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg_crop]',
                    '[bg_crop][1:v]overlay=shortest=1[outv]'
                ])
                .outputOptions([
                    '-map [outv]',
                    '-pix_fmt yuv420p',
                    '-preset medium',
                    '-crf 18',
                    '-t 30'
                ])
                .videoCodec('libx264')
                .on('end', () => resolve(outputPath))
                .on('error', (err) => reject(err))
                .save(outputPath);
        });
    }
}

module.exports = {
    generator: new VideoGenerator(),
    CAMPAIGNS
};
