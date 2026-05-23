const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const videoGenerator = require('../jobs/video-generator');
const lungGenerator = require('../jobs/lung-video-generator');
const { runBrief } = require('../jobs/brief-pipeline');
const { checkAuth } = require('../middleware/auth');

// 15MB cap is plenty for an iPhone Pro still. Stays in memory; we hand the
// buffer straight to Replicate as a base64 data URI, no disk I/O.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
});


// In-memory job state
const JOBS = {};

// Using centralized checkAuth middleware


router.post('/generate', checkAuth, async (req, res) => {
    const jobId = 'batch-' + Date.now();
    
    // Initialize job state
    JOBS[jobId] = {
        id: jobId,
        status: 'processing',
        timestamp: new Date(),
        progress: {} // techniqueKey -> phase
    };

    // Start background process
    videoGenerator.generator.generateAll((techKey, phase) => {
        JOBS[jobId].progress[techKey] = phase;
        console.log(`[Video Studio] ${techKey}: ${phase}`);
        
        // Finalize job status if all done
        const allDone = Object.keys(videoGenerator.CAMPAIGNS).every(tKey => 
            JOBS[jobId].progress[tKey] === 'Done' || JOBS[jobId].progress[tKey]?.startsWith('Error')
        );
        
        if (allDone) {
            JOBS[jobId].status = 'completed';
        }
    }).catch(err => {
        console.error('Job Orchestration Failed:', err);
        JOBS[jobId].status = 'error';
        JOBS[jobId].error = err.message;
    });

    res.json({ success: true, jobId });
});

router.post('/generate-lung', checkAuth, async (req, res) => {
    const jobId = 'lung-' + Date.now();
    const technique = req.body.technique || 'box-breathing';
    
    JOBS[jobId] = {
        id: jobId,
        status: 'processing',
        timestamp: new Date(),
        progress: {}
    };

    lungGenerator.generator.generateAll((techKey, phase) => {
        JOBS[jobId].progress[techKey] = phase;
        if (phase === 'Done' || phase.startsWith('Error')) {
            JOBS[jobId].status = phase === 'Done' ? 'completed' : 'error';
        }
    }, technique).catch(err => {
        console.error('Lung Video Generation Failed:', err);
        JOBS[jobId].status = 'error';
        JOBS[jobId].error = err.message;
    });

    res.json({ success: true, jobId });
});

// Freelancer dashboard: brief (+ optional uploaded image) -> Flux -> Kling -> Dropbox.
router.post('/brief', checkAuth, upload.single('image'), async (req, res) => {
    const brief = (req.body && req.body.brief ? String(req.body.brief) : '').trim();
    const file = req.file;

    if (!brief && !file) {
        return res.status(400).json({ error: 'Provide a brief, an image, or both.' });
    }
    if (!process.env.REPLICATE_API_TOKEN || !process.env.DROPBOX_ACCESS_TOKEN) {
        return res.status(503).json({ error: 'Video pipeline not configured (missing API tokens).' });
    }

    const jobId = 'brief-' + Date.now();
    JOBS[jobId] = {
        id: jobId,
        type: 'brief',
        status: 'processing',
        phase: 'starting',
        label: 'Starting…',
        brief,
        hasUpload: !!file,
        timestamp: new Date(),
    };

    runBrief({
        brief,
        imageBuffer: file ? file.buffer : null,
        imageMime: file ? file.mimetype : null,
        onProgress: ({ phase, label }) => {
            JOBS[jobId].phase = phase;
            JOBS[jobId].label = label;
            console.log(`[brief ${jobId}] ${phase} :: ${label}`);
        },
    }).then((result) => {
        JOBS[jobId].status = 'completed';
        JOBS[jobId].label = 'Done';
        JOBS[jobId].result = result;
    }).catch((err) => {
        console.error(`[brief ${jobId}] failed:`, err);
        JOBS[jobId].status = 'error';
        JOBS[jobId].error = err.message || String(err);
    });

    res.json({ success: true, jobId });
});

router.get('/status/:jobId', checkAuth, (req, res) => {
    const job = JOBS[req.params.jobId];
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

router.get('/download/:filename', checkAuth, (req, res) => {
    const filePath = path.join(__dirname, '../../output/videos', req.params.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    res.download(filePath);
});

router.post('/clear-cache', checkAuth, async (req, res) => {
    try {
        const outputDir = path.join(__dirname, '../../output/videos');
        await fs.emptyDir(outputDir);
        res.json({ success: true, message: 'Video cache cleared' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
