const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = 'WKuirq2f3xMEda412HQt'; // Quiet Luxury voice
const OUTPUT_DIR = path.join(__dirname, '../tmp/audio');

async function generateVO(text, filename) {
    console.log(`Generating VO for: "${text}" -> ${filename}`);
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
    
    try {
        const response = await axios({
            method: 'post',
            url: url,
            data: {
                text: text,
                model_id: 'eleven_monolingual_v1',
                voice_settings: {
                    stability: 0.75,
                    similarity_boost: 0.75
                }
            },
            headers: {
                'Accept': 'audio/mpeg',
                'xi-api-key': API_KEY,
                'Content-Type': 'application/json'
            },
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(path.join(OUTPUT_DIR, filename));
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (err) {
        console.error(`Error generating VO for ${filename}:`, err.response ? err.response.data : err.message);
        throw err;
    }
}

async function main() {
    await fs.ensureDir(OUTPUT_DIR);
    
    const clips = [
        { text: "Five.", file: "vo_sc2.mp3" },
        { text: "Four... three... two... one...", file: "vo_sc3.mp3" },
        { text: "It's shocking the results you get once you know how to breathe properly.", file: "vo_sc4.mp3" }
    ];

    for (const clip of clips) {
        await generateVO(clip.text, clip.file);
    }
    console.log("All VO clips generated.");
}

main().catch(console.error);
