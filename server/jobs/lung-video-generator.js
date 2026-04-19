const fs = require('fs-extra');
const path = require('path');
const { createCanvas, registerFont, loadImage } = require('canvas');
const ffmpeg = require('fluent-ffmpeg');

// Set FFmpeg path if provided in env, otherwise rely on system PATH
if (process.env.FFMPEG_PATH) {
    ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

const BREATHING_TECHNIQUES = {
    'box-breathing': {
        name: 'Box Breathing',
        phases: [
            { label: 'INHALE',      duration: 4, fillDirection: 'up'   },
            { label: 'HOLD',        duration: 4, fillDirection: 'hold' },
            { label: 'EXHALE',      duration: 4, fillDirection: 'down' },
            { label: 'HOLD',        duration: 4, fillDirection: 'hold' },
        ],
        cycleTotal: 16,
        color: '#52AB98',
        glowColor: 'rgba(82, 171, 152, 0.4)',
    }
};

class LungVideoGenerator {
    constructor() {
        this.outputDir = path.join(__dirname, '../../output/videos');
        this.tmpDir = path.join(__dirname, '../../tmp/lung-gen');
        fs.ensureDirSync(this.outputDir);
        fs.ensureDirSync(this.tmpDir);
        
        const fontPath = path.join(__dirname, '../../public/fonts/Outfit-Medium.ttf');
        if (fs.existsSync(fontPath)) {
            registerFont(fontPath, { family: 'Outfit' });
        }
        
        // Image Assets
        this.logoPath = path.join(__dirname, '../../assets/images/aura_logo.png');
    }

    async generateAll(onProgress, techniqueKey = 'box-breathing') {
        const tech = BREATHING_TECHNIQUES[techniqueKey];
        if (!tech) throw new Error(`Technique ${techniqueKey} not found`);

        try {
            // Guarded logo load
            this.logoImg = fs.existsSync(this.logoPath) 
                ? await loadImage(this.logoPath) 
                : null;

            if (onProgress) onProgress(techniqueKey, 'Rendering Frames');
            const framesDir = await this.renderFrames(techniqueKey, tech);
            
            if (onProgress) onProgress(techniqueKey, 'Assembling');
            const videoPath = await this.assembleVideo(techniqueKey, framesDir);
            
            if (onProgress) onProgress(techniqueKey, 'Done');
            return { techniqueKey, videoPath };
        } catch (err) {
            console.error(`Error generating ${techniqueKey}:`, err);
            if (onProgress) onProgress(techniqueKey, 'Error: ' + err.message);
            throw err;
        }
    }

    async renderFrames(techKey, tech) {
        const framesDir = path.join(this.tmpDir, techKey, 'frames');
        await fs.ensureDir(framesDir);
        await fs.emptyDir(framesDir);

        const width = 1080;
        const height = 1920;
        const fps = 30;
        const duration = 30;
        const totalFrames = duration * fps;
        
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        const stars = this.generateStars(width, height);

        // Logo positioning (1024x1024 centered vertically at 840. Center Y is 840, so and logo is 1024 high, 
        // logoX = (1080-1024)/2 = 28, logoY = 840 - 512 = 328)
        const logoSize = 1024;
        const logoX = 28;
        const logoY = 328;

        for (let frame = 0; frame < totalFrames; frame++) {
            const time = frame / fps;
            const state = this.getPhaseState(time, tech);
            
            ctx.clearRect(0, 0, width, height);

            // 1. Background
            this.drawLiquidUniverseBackground(ctx, width, height, frame, stars);
            
            // 2. Image-Based Lungs (using procedural clipping)
            this.drawImageLungs(ctx, state.fillLevel, frame, tech.color, logoX, logoY, logoSize);

            // 3. UI
            this.drawUI(ctx, state.phase, state.phaseProgress, width, height);

            // 4. Post Processing
            this.applyCinematicPostProcessing(ctx, width, height, frame);

            const buffer = canvas.toBuffer('image/png');
            await fs.writeFile(path.join(framesDir, `frame-${frame.toString().padStart(4, '0')}.png`), buffer);
            
            if (frame % 60 === 0) console.log(`[Lung Gen] Frame ${frame}/${totalFrames}`);
        }
        
        return framesDir;
    }

    drawImageLungs(ctx, fillLevel, frame, color, logoX, logoY, size) {
        // --- LEFT LUNG WATER FILL ---
        ctx.save();
        this.drawLeftLungPath(ctx);
        ctx.clip();
        
        const leftBounds = { top: 490, bottom: 1110 }; // vertical range of left lung
        this.drawWaterInBounds(ctx, fillLevel, frame, color, leftBounds);
        ctx.restore();

        // --- RIGHT LUNG WATER FILL ---
        ctx.save();
        this.drawRightLungPath(ctx);
        ctx.clip();

        const rightBounds = { top: 490, bottom: 1110 }; // same range
        this.drawWaterInBounds(ctx, fillLevel, frame, color, rightBounds);
        ctx.restore();

        // --- LOGO OVERLAY (glowing strokes) ---
        if (this.logoImg) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.9;
            ctx.drawImage(this.logoImg, logoX, logoY, size, size);
            ctx.restore();
        }
    }

    drawLeftLungPath(ctx) {
        ctx.beginPath();
        ctx.moveTo(483, 490);
        // Upper outer arc
        ctx.bezierCurveTo(400, 450, 220, 465, 140, 595);
        // Outer sweep down
        ctx.bezierCurveTo(65, 720, 75, 895, 155, 1000);
        // Bottom lobe curve
        ctx.bezierCurveTo(215, 1075, 355, 1110, 455, 1065);
        // Inner lower edge
        ctx.bezierCurveTo(505, 1040, 510, 920, 510, 840);
        // Inner upper edge
        ctx.bezierCurveTo(510, 710, 500, 580, 483, 490);
        ctx.closePath();
    }

    drawRightLungPath(ctx) {
        ctx.beginPath();
        ctx.moveTo(597, 490);
        // Upper outer
        ctx.bezierCurveTo(680, 450, 860, 465, 940, 595);
        // Outer sweep
        ctx.bezierCurveTo(1015, 720, 1005, 895, 925, 1000);
        // Bottom
        ctx.bezierCurveTo(865, 1075, 725, 1110, 625, 1065);
        // Inner lower
        ctx.bezierCurveTo(575, 1040, 570, 920, 570, 840);
        // Inner upper
        ctx.bezierCurveTo(570, 710, 580, 580, 597, 490);
        ctx.closePath();
    }

    drawWaterInBounds(ctx, fillLevel, frame, color, { top, bottom }) {
        const totalHeight = bottom - top;
        const fillTop = bottom - (totalHeight * fillLevel);

        // Wave surface
        ctx.beginPath();
        ctx.moveTo(0, bottom);
        ctx.lineTo(0, fillTop);
        
        const waveAmp = 8;
        const waveFreq = 0.012;
        const waveSpeed = frame * 0.08;
        
        for (let ix = 0; ix <= 1080; ix += 6) {
            const waveY = fillTop + Math.sin(ix * waveFreq + waveSpeed) * waveAmp;
            ctx.lineTo(ix, waveY);
        }
        
        ctx.lineTo(1080, bottom);
        ctx.closePath();

        // Teal gradient: lighter at surface, darker at base
        const grad = ctx.createLinearGradient(0, fillTop, 0, bottom);
        grad.addColorStop(0,   'rgba(82, 200, 180, 0.85)');
        grad.addColorStop(0.4, 'rgba(44, 120, 115, 0.75)');
        grad.addColorStop(1,   'rgba(10, 45, 40, 0.90)');
        ctx.fillStyle = grad;
        ctx.fill();
    }

    // --- Background & Post Processing ---

    drawLiquidUniverseBackground(ctx, width, height, frame, stars) {
        ctx.fillStyle = '#020108';
        ctx.fillRect(0, 0, width, height);
        const time = frame * 0.01;
        const drawCloud = (x, y, radius, color, seed) => {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const nx = x + Math.sin(time * 0.5 + seed) * 150;
            const ny = y + Math.cos(time * 0.3 + seed) * 100;
            const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, radius);
            grad.addColorStop(0, color);
            grad.addColorStop(0.5, color.replace(/[\d.]+\)$/, '0.05)'));
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(nx, ny, radius, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        };
        drawCloud(width * 0.7, height * 0.8, height * 0.6, 'rgba(180, 0, 180, 0.12)', 1.2);
        drawCloud(width * 0.3, height * 0.7, height * 0.5, 'rgba(120, 0, 180, 0.08)', 2.5);
        drawCloud(width * 0.2, height * 0.3, height * 0.7, 'rgba(44, 120, 115, 0.15)', 3.8);

        stars.forEach(star => {
            const driftX = (frame * star.speed * 0.4) % width;
            let sx = star.x + driftX; if (sx > width) sx -= width;
            const twinkle = Math.sin(frame * star.twinkle) * 0.3;
            ctx.globalAlpha = Math.max(0.1, Math.min(1, star.opacity + twinkle));
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(sx, star.y, star.size, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1.0;
    }

    applyCinematicPostProcessing(ctx, width, height, frame) {
        ctx.save();
        ctx.globalAlpha = 0.05;
        for (let i = 0; i < 2000; i++) {
            const gx = Math.random() * width;
            const gy = Math.random() * height;
            ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
            ctx.fillRect(gx, gy, 1, 1);
        }
        ctx.restore();
    }

    getPhaseState(time, technique) {
        const cycleTime = time % technique.cycleTotal;
        let accumulatedTime = 0;
        let phase = technique.phases[0];
        for (const p of technique.phases) {
            if (cycleTime < accumulatedTime + p.duration) {
                phase = p;
                break;
            }
            accumulatedTime += p.duration;
        }
        const timeInPhase = cycleTime - accumulatedTime;
        const phaseProgress = timeInPhase / phase.duration;
        const ease = (t) => t * t * (3 - 2 * t);
        const easedProgress = ease(phaseProgress);
        let fillLevel = 0;
        if (phase.fillDirection === 'up') fillLevel = easedProgress;
        else if (phase.fillDirection === 'down') fillLevel = 1 - easedProgress;
        else if (phase.fillDirection === 'hold') {
            const phaseIndex = technique.phases.indexOf(phase);
            const prevPhase = technique.phases[(phaseIndex - 1 + technique.phases.length) % technique.phases.length];
            fillLevel = prevPhase.fillDirection === 'up' ? 1 : 0;
        }
        return { phase, phaseProgress, fillLevel };
    }

    generateStars(width, height) {
        const stars = [];
        const layers = [
            { count: 300, size: [0.2, 0.8], speed: 0.2, opacity: [0.1, 0.4] },
            { count: 150, size: [0.8, 1.5], speed: 0.5, opacity: [0.4, 0.7] },
            { count: 50,  size: [1.5, 2.5], speed: 1.2, opacity: [0.6, 0.9] }
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
        return stars;
    }

    drawUI(ctx, phase, progress, width, height) {
        ctx.save();
        const y = 1450;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '300 72px Outfit';
        if (!ctx.font.includes('Outfit')) ctx.font = '300 72px Helvetica';
        ctx.textAlign = 'center';
        ctx.fillText(phase.label, width / 2, y);
        const ringY = y + 100;
        ctx.beginPath();
        ctx.arc(width/2, ringY, 30, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(width/2, ringY, 30, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * (1 - progress)));
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
    }

    async assembleVideo(techKey, framesDir) {
        const outputPath = path.join(this.outputDir, `${techKey}-lungs.mp4`);
        return new Promise((resolve, reject) => {
            ffmpeg()
                .input(path.join(framesDir, 'frame-%04d.png'))
                .inputFPS(30)
                .outputOptions([
                    '-pix_fmt yuv420p',
                    '-preset medium',
                    '-crf 18',
                    '-t 30'
                ])
                .on('end', () => resolve(outputPath))
                .on('error', (err) => reject(err))
                .save(outputPath);
        });
    }
}

module.exports = {
    generator: new LungVideoGenerator(),
    BREATHING_TECHNIQUES
};
