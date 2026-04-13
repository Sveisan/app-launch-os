const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const videoGenerator = require('../jobs/video-generator');

// In-memory job state
const JOBS = {};

// Auth Key
const SECRET_KEY = 'breathe88';
const checkAuth = (req, res, next) => {
    const key = req.query.auth || req.body.auth;
    if (key === SECRET_KEY) {
        next();
    } else {
        res.status(404).send('Not Found');
    }
};

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
        const allDone = Object.keys(videoGenerator.TECHNIQUES).every(tKey => 
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
