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
    },

    // --- Situational Moments ---
    'morning-switch': {
        name: 'The Switch',
        sequence: [
            "Your nervous system wakes up before you do.",
            "In the first minutes of morning, cortisol spikes 50%.",
            "Most people fight it. The ones who know — use it.",
            "Three minutes of nasal breathing with a long exhale shifts you from reactive to intentional.",
            "Set the tone before the world does.",
            "Start with breath."
        ],
        context: 'Morning Activation'
    },
    'pre-meeting-close': {
        name: 'The Close',
        sequence: [
            "Your best ideas don't show up when you're anxious.",
            "Right before a high-stakes moment, adrenaline narrows your thinking.",
            "Four counts in. Hold four. Out for eight. Twice.",
            "Your prefrontal cortex comes back online. Your voice steadies.",
            "Go in ready.",
            "Breathe before you speak."
        ],
        context: 'Pre-Meeting Nerves'
    },
    'panic-override': {
        name: 'The Override',
        sequence: [
            "Panic is a false alarm. Your body doesn't know that.",
            "When anxiety hijacks your system, your breath leads the way out.",
            "Slow your exhale longer than your inhale.",
            "Activate your vagus nerve. Signal safety.",
            "Panic has a ceiling. Your breath is the override code.",
            "Exhale longer. Always."
        ],
        context: 'Panic Attack / Anxiety Spike'
    },
    'post-workout-return': {
        name: 'The Return',
        sequence: [
            "You trained hard.",
            "Now let your body catch up.",
            "After intense effort, your body is still in fight mode.",
            "Recovery isn't passive.",
            "Slow nasal breathing brings your heart rate down faster than rest alone.",
            "Your muscles recover quicker.",
            "The breath is the finish line.",
            "Breathe to recover."
        ],
        context: 'Post-Workout Recovery'
    },
    'slump-reset': {
        name: 'The Reset',
        sequence: [
            "The afternoon slump isn't laziness.",
            "It's biology.",
            "Your energy naturally dips between 2 and 4pm.",
            "Instead of caffeine: 20 quick nasal breaths. Then hold.",
            "Blood rushes to your brain.",
            "Alertness snaps back.",
            "No crash. No dependency.",
            "Reset. Don't caffeinate."
        ],
        context: '2pm Energy Slump'
    },
    'presleep-descent': {
        name: 'The Descent',
        sequence: [
            "You can't think your way into sleep.",
            "Trying makes it worse.",
            "When you extend your exhale, your body takes over.",
            "Heart rate drops. Muscles release.",
            "Your mind stops looking for threats.",
            "Four in. Eight out.",
            "Repeat until you're gone.",
            "Let the exhale carry you."
        ],
        context: 'Pre-Sleep Wind-Down'
    },
    'anger-pause': {
        name: 'The Pause',
        sequence: [
            "Anger is a physical event.",
            "Not a personality trait.",
            "When rage fires, your thinking brain goes offline.",
            "You can't reason your way out. Not yet.",
            "One slow exhale. Six seconds out.",
            "Your thinking comes back.",
            "The pause is the power.",
            "Breathe before you react."
        ],
        context: 'Anger Reset'
    },

    // --- Myth-Busting ---
    'mouth-breathing-default': {
        name: 'The Default Nobody Talks About',
        sequence: [
            "If you breathe through your mouth, you're doing it wrong.",
            "Mouth breathing bypasses your body's filtration, humidification, and nitric oxide system.",
            "It keeps your nervous system in low-grade fight-or-flight.",
            "Dental issues. Poor sleep. Lower oxygen delivery.",
            "Nasal breathing isn't optional. It's the standard you were designed for.",
            "Close your mouth. Start there."
        ],
        context: 'Mouth Breathing Myth'
    },
    'chest-belly-shallow': {
        name: 'The Shallow Trap',
        sequence: [
            "Sent every breath. All day.",
            "Breathing into your chest keeps your body on edge.",
            "It's a stress signal.",
            "Breathing into your belly tells your body the opposite.",
            "You're safe. You're in control.",
            "Most people have never breathed correctly.",
            "Breathe from your belly."
        ],
        context: 'Chest vs Belly Breathing'
    },
    'deep-breath-backfires': {
        name: 'The Advice That Backfires',
        sequence: [
            "Taking a deep breath isn't always the answer.",
            "Most people gasp in when anxious — making it worse.",
            "Inhaling activates the sympathetic system.",
            "Exhaling activates the parasympathetic.",
            "The science is clear: it's the exhale that calms you.",
            "A long, slow out-breath — not a big in-breath — is the reset. The exhale is the answer."
        ],
        context: '"Just Take a Deep Breath" Myth'
    },
    'overbreathing-epidemic': {
        name: 'The Invisible Epidemic',
        sequence: [
            "You might be breathing too much.",
            "That's the problem.",
            "More breaths doesn't mean more oxygen.",
            "It means less.",
            "When you overbreathe, your blood vessels tighten.",
            "Oxygen can't reach your body.",
            "Breathe slower.",
            "Breathe less.",
            "More oxygen."
        ],
        context: 'Overbreathing Myth'
    },

    // --- Audience-Specific ---
    'athletes-advantage': {
        name: 'The Unfair Advantage',
        sequence: [
            "The best athletes aren't just stronger.",
            "They breathe differently.",
            "How long you can push before you break comes down to how well you breathe.",
            "Train it deliberately.",
            "Nose breathing during easy sessions raises your ceiling.",
            "When it matters - you don't gas out.",
            "You outlast.",
            "Train your breath. Raise your ceiling."
        ],
        context: 'Athletes'
    },
    'executives-clarity': {
        name: 'The Clarity Protocol',
        sequence: [
            "Decisions made under stress are rarely your best ones.",
            "Pressure shrinks your thinking.",
            "You see less. React more.",
            "The people who perform best under sustained pressure have one thing in common.",
            "They regulate.",
            "Three minutes.",
            "Before the decision that matters.",
            "The best decision starts with a breath."
        ],
        context: 'Executives / High-Performers'
    },
    'students-exam': {
        name: 'The Exam Protocol',
        sequence: [
            "Your brain has everything it needs.",
            "Anxiety is hiding it.",
            "Nerves before an exam aren't a knowledge problem.",
            "They're a stress problem.",
            "A few minutes of controlled breathing before you sit down clears the way to what you already know.",
            "The information is there.",
            "Breathe the path to it."
        ],
        context: 'Students'
    },
    'parents-reset': {
        name: 'The 60-Second Reset',
        sequence: [
            "When you're overwhelmed, the people around you feel it too.",
            "But calm works the same way.",
            "Sixty seconds of slow breathing changes how you show up in the room.",
            "You set the tone.",
            "Without saying a word.",
            "You reset first.",
            "Then everything else does.",
            "You go first."
        ],
        context: 'Parents'
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
            this.drawLiquidUniverseBackground(ctx, width, height, frame, stars, smoothProgress);
            
            // 0.5 DRAW GOD RAYS (Behind Orb) - LOWERED POSITION
            this.drawGodRays(ctx, width/2, height * 0.60, smoothProgress, frame);
            
            // 1. Draw Eternal Breathing Orb (Hypnotic, Continuous) - LOWERED POSITION
            this.drawOrb(ctx, width/2, height * 0.60, smoothProgress, frame);
            
            // 1.5 ANAMORPHIC FLARE REMOVED (User requested dropping horizontal glow)
            // this.drawAnamorphicFlare(ctx, width/2, height * 0.60, smoothProgress);
            
            // 2. Fading Text Narrative Sequence
            // Spread sequence evenly across 30seconds 
            const segmentTime = duration / tech.sequence.length;
            const seqIndex = Math.min(Math.floor(time / segmentTime), tech.sequence.length - 1);
            const timeInSeq = time % segmentTime;
            
            // Fade in over 1.5s, fade out over 1.5s at end of segment
            let textAlpha = 1.0;
            if (timeInSeq < 1.0) { // Sharper fade for faster reading
                textAlpha = timeInSeq / 1.0;
            } else if (timeInSeq > segmentTime - 1.0) {
                textAlpha = (segmentTime - timeInSeq) / 1.0;
            }

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 30;
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            
            // Split line into multiple if it's too long
            const words = tech.sequence[seqIndex].split(' ');
            let line = '';
            let yOffset = 380; // Moved slightly up to give more room for multi-line text blocks
            const lineHeight = 65;

            
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

    drawLiquidUniverseBackground(ctx, width, height, frame, stars, progress) {
        // Atmospheric Breathing: modulate background brightness
        const breathMod = 0.5 + (Math.sin(progress * Math.PI) * 0.1);
        
        // Deep Space Base (Rich Deep Depth) - slightly shifts color
        ctx.fillStyle = `rgba(2, 1, 8, 1)`;
        ctx.fillRect(0, 0, width, height);

        // 0. BACKGROUND BREATHING GLOW
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const bgGlow = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, height);
        bgGlow.addColorStop(0, `rgba(44, 120, 115, ${0.05 * breathMod})`);
        bgGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = bgGlow;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();

        // 1. ORGANIC SOFT-BODY NEBULAE
        const time = frame * 0.01;
        
        const drawCloud = (x, y, radius, color, seed, morphSpeed = 1.0) => {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            // Use sine-driven drift for "liquid" gas movement
            const nx = x + Math.sin(time * 0.5 * morphSpeed + seed) * 150;
            const ny = y + Math.cos(time * 0.3 * morphSpeed + seed) * 100;
            
            // Morph the radius slightly
            const currentRadius = radius * (1 + Math.sin(time * 0.2 + seed) * 0.1);
            
            const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, currentRadius);
            grad.addColorStop(0, color);
            grad.addColorStop(0.5, color.replace(/[\d.]+\)$/, `${0.05 * breathMod})`));
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(nx, ny, currentRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };

        // Layered clusters for a "Real" nebula look
        // Magenta/Violet core clusters - more present during exhale/inhale transition
        drawCloud(width * 0.7, height * 0.8, height * 0.6, 'rgba(180, 0, 180, 0.15)', 1.2, 0.8);
        drawCloud(width * 0.3, height * 0.7, height * 0.5, 'rgba(120, 0, 180, 0.12)', 2.5, 1.2);
        
        // Brand Teal depth
        drawCloud(width * 0.2, height * 0.3, height * 0.7, 'rgba(44, 120, 115, 0.15)', 3.8, 0.5);

        // 2. DEPTH-OF-FIELD STARFIELD & SPACE DUST
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
            
            // Particle scaling (Space Dust effect)
            const pulseScale = 1 + (Math.sin(progress * Math.PI) * 0.05);
            const size = star.size * pulseScale;

            ctx.globalAlpha = Math.max(0.1, Math.min(1, (star.opacity + twinkle) * breathMod));
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(sx, star.y, size, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });
        
        // 3. METEOR SHOWER (Enhanced - 5 simultaneous paths)
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 5; i++) {
            const meteorSeed = i * 7.2;
            const meteorCycle = (time * (0.4 + i * 0.15) + meteorSeed) % 10;
            if (meteorCycle > 1 && meteorCycle < 3) {
                const localProgress = (meteorCycle - 1) / 2;
                const msx = width * 1.4 - (localProgress * width * 2.0);
                const msy = height * (0.05 + i * 0.15) + (localProgress * height * 0.4);

                
                ctx.beginPath();
                ctx.moveTo(msx, msy);
                ctx.lineTo(msx + 100, msy - 40);
                const grad = ctx.createLinearGradient(msx, msy, msx + 100, msy - 40);
                grad.addColorStop(0, `rgba(255, 255, 255, ${Math.max(0, 1 - localProgress)})`);
                grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.strokeStyle = grad;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
        ctx.restore();

        // 4. THE VOYAGER (Spacecraft Silhouette)
        this.drawSpacecraft(ctx, width, height, frame);
        
        ctx.globalAlpha = 1.0;
    }

    drawSpacecraft(ctx, width, height, frame) {
        const time = frame * 0.005;
        const x = width * 0.8 + Math.sin(time) * 100;
        const y = height * 0.2 + Math.cos(time * 0.7) * 50;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 6); // Slanted drift

        // Ion Trail
        const trailGrad = ctx.createLinearGradient(0, 0, 150, -20);
        trailGrad.addColorStop(0, 'rgba(100, 200, 255, 0.4)');
        trailGrad.addColorStop(1, 'rgba(100, 200, 255, 0)');
        ctx.fillStyle = trailGrad;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(150, -20);
        ctx.lineTo(140, 10);
        ctx.closePath();
        ctx.fill();

        // Minimalist Body
        ctx.fillStyle = 'rgba(10, 10, 20, 0.95)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-20, 10);
        ctx.lineTo(-15, -10);
        ctx.closePath();
        ctx.fill();
        
        // Specular highlight on ship
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(-5, -2, 2, 2);
        
        ctx.restore();
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

    drawOrb(ctx, x, y, progress, frame) {
        const sizeBase = 320; // Increased for more immersion
        
        // Progress goes 0 to 1. Scale smoothly from 1.0 -> 1.4 -> 1.0 over the cycle
        const scale = 1.0 + (progress * 0.4);
        const radius = sizeBase * scale;

        // 1. ATMOSPHERIC SOUL GLOW & CORONA
        const auraAlpha = 0.1 + (progress * 0.1);
        const coronaAlpha = 0.2 + (progress * 0.3);
        
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        
        // The Outer Aura
        const aura = ctx.createRadialGradient(x, y, 0, x, y, radius * 4);
        aura.addColorStop(0, `rgba(82, 171, 152, ${auraAlpha})`);
        aura.addColorStop(0.5, `rgba(44, 120, 115, ${auraAlpha * 0.3})`);
        aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(x, y, radius * 4, 0, Math.PI * 2);
        ctx.fill();

        // The Corona (Sharp energy flare at the edge)
        const corona = ctx.createRadialGradient(x, y, radius * 0.95, x, y, radius * 1.05);
        corona.addColorStop(0, 'rgba(255, 255, 255, 0)');
        corona.addColorStop(0.5, `rgba(150, 255, 240, ${coronaAlpha})`);
        corona.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = corona;
        ctx.beginPath();
        ctx.arc(x, y, radius * 1.1, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();

        // 2. THE STELLAR CORE (Liquid Universe)
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip(); // Mask everything inside the planet shell

        // Layered Gaseous Textures
        const time = frame * 0.02;
        
        // Base Deep Color
        ctx.fillStyle = '#050212';
        ctx.fillRect(-radius + x, -radius + y, radius * 2, radius * 2);

        const drawGasLayer = (color, seed, speed, scaleMod) => {
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.translate(x, y);
            ctx.rotate(time * speed + seed);
            
            const grad = ctx.createLinearGradient(-radius * scaleMod, -radius * scaleMod, radius * scaleMod, radius * scaleMod);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(0.5, color);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            
            ctx.fillStyle = grad;
            ctx.fillRect(-radius * 2, -radius * 2, radius * 4, radius * 4);
            ctx.restore();
        };

        // Swirling gas layers
        drawGasLayer('rgba(44, 120, 115, 0.8)', 0, 0.5, 1.2); // Teal
        drawGasLayer('rgba(120, 0, 180, 0.5)', 2.1, -0.3, 1.5); // Purple
        drawGasLayer('rgba(255, 255, 255, 0.2)', 4.5, 0.8, 0.8); // White highlights

        // Inner Depth Shading (3D Sphere effect)
        const innerShadow = ctx.createRadialGradient(x - radius * 0.2, y - radius * 0.2, 0, x, y, radius);
        innerShadow.addColorStop(0, 'rgba(255, 255, 255, 0.05)'); // Subtle inner light
        innerShadow.addColorStop(0.5, 'rgba(0,0,0,0)');
        innerShadow.addColorStop(1, 'rgba(0,0,0,0.92)'); // Hard shadow at edge
        ctx.fillStyle = innerShadow;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();

        // 2.6 ACCRETION DISK REMOVED (User requested dropping horizontal glow)
        // this.drawAccretionDisk(ctx, x, y, radius, progress);

        // 3. ULTRA-GLASS REFRACTIVE SHELL
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        
        // Rim Highlight - Sharp Outer Arc
        ctx.beginPath();
        ctx.arc(x, y, radius, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 + (progress * 0.1)})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Soft Interior Rim Glow
        const rim = ctx.createRadialGradient(x, y, radius * 0.85, x, y, radius);
        rim.addColorStop(0, 'rgba(82, 171, 152, 0)');
        rim.addColorStop(1, `rgba(150, 255, 240, ${0.3 + (progress * 0.2)})`);
        ctx.fillStyle = rim;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Specular Glint (Sharp Shine)
        const glintX = x - radius * 0.35;
        const glintY = y - radius * 0.35;
        const glint = ctx.createRadialGradient(glintX, glintY, 0, glintX, glintY, radius * 0.5);
        glint.addColorStop(0, `rgba(255, 255, 255, ${0.4 + (progress * 0.2)})`);
        glint.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glint;
        ctx.beginPath();
        ctx.arc(glintX, glintY, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Bottom Ocean Reflection (Deep Violet)
        const reflect = ctx.createLinearGradient(x, y + radius * 0.3, x, y + radius);
        reflect.addColorStop(0, 'rgba(180, 0, 180, 0)');
        reflect.addColorStop(1, `rgba(180, 0, 180, ${0.2 + (progress * 0.2)})`);
        ctx.fillStyle = reflect;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }

    drawBlackHoleCore(ctx, x, y, orbRadius, progress) {
        // More subtle core: reduced radius from 0.3 to 0.1
        const holeRadius = orbRadius * 0.1 * (1 + (1 - progress) * 0.2);
        
        ctx.save();
        // Cut the hole
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, holeRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw the black hole (back to source-over)
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(x, y, holeRadius, 0, Math.PI * 2);
        ctx.fill();

        // Photon Ring (Cyan Edge)
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(100, 255, 240, 0.8)';
        ctx.strokeStyle = 'rgba(150, 255, 240, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }

    drawAccretionDisk(ctx, x, y, orbRadius, progress) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        
        const diskRadiusX = orbRadius * 1.8;
        const diskRadiusY = orbRadius * 0.15;
        const alpha = 0.1 + (progress * 0.1);

        const grad = ctx.createRadialGradient(x, y, orbRadius * 0.8, x, y, diskRadiusX);
        grad.addColorStop(0, `rgba(150, 255, 240, ${alpha})`);
        grad.addColorStop(1, 'rgba(150, 255, 240, 0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(x, y, diskRadiusX, diskRadiusY, Math.PI / 12, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }

    drawGodRays(ctx, x, y, progress, frame) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const numRays = 12;
        const time = frame * 0.01;
        
        for (let i = 0; i < numRays; i++) {
            const angle = (i / numRays) * Math.PI * 2 + time * 0.1;
            const length = 800 + (Math.sin(time * 0.5 + i) * 100);
            const width = 0.2 + (progress * 0.3);
            
            const grad = ctx.createLinearGradient(x, y, x + Math.cos(angle) * length, y + Math.sin(angle) * length);
            grad.addColorStop(0, `rgba(150, 255, 240, ${0.1 * progress})`);
            grad.addColorStop(0.5, `rgba(150, 255, 240, ${0.02 * progress})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            
            ctx.beginPath();
            ctx.moveTo(x, y);
            const p1x = x + Math.cos(angle - width) * length;
            const p1y = y + Math.sin(angle - width) * length;
            const p2x = x + Math.cos(angle + width) * length;
            const p2y = y + Math.sin(angle + width) * length;
            ctx.lineTo(p1x, p1y);
            ctx.lineTo(p2x, p2y);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
        }
        ctx.restore();
    }

    drawAnamorphicFlare(ctx, x, y, progress) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        
        const flareWidth = 1080;
        const flareHeight = 2 + (progress * 10);
        const flareAlpha = 0.1 * progress;
        
        const grad = ctx.createLinearGradient(x - flareWidth/2, y, x + flareWidth/2, y);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.1, 'rgba(150, 255, 255, 0)');
        grad.addColorStop(0.5, `rgba(150, 255, 255, ${flareAlpha})`);
        grad.addColorStop(0.9, 'rgba(150, 255, 255, 0)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.fillStyle = grad;
        ctx.fillRect(0, y - flareHeight/2, 1080, flareHeight);
        
        // Add a central core highlight to the flare
        const coreGrad = ctx.createRadialGradient(x, y, 0, x, y, flareHeight * 4);
        coreGrad.addColorStop(0, `rgba(255, 255, 255, ${flareAlpha * 2})`);
        coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = coreGrad;
        ctx.fillRect(0, y - flareHeight, 1080, flareHeight * 2);
        
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
