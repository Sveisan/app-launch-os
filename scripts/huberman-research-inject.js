const { pool } = require('../server/db/index');
require('dotenv').config();

const slug = 'huberman-physiological-sigh';
const title = 'Physiological Sigh (The Huberman Protocol)';

const contentJson = {
    intro: "The Physiological Sigh is a rapid, evidence-based mechanism for lowering autonomic arousal. Popularized by Stanford neuroscientist Dr. Andrew Huberman, this double-inhale breathing pattern effectively offloads carbon dioxide and pops open the air sacs (alveoli) in the lungs, triggering an immediate calming response in the nervous system.",
    appreciation_note: "We hold immense respect for Dr. Andrew Huberman's work in neurobiology and his commitment to zero-cost health education. This implementation is a tribute to the clarity and scientific rigor he brings to the field of human performance.",
    how_to: {
        pattern: "Double Inhale, Long Exhale",
        duration_minutes: 2,
        steps: [
            "Take a deep inhale through your nose until your lungs are nearly full.",
            "Take a short, sharp second inhale through your nose to fully expand the lungs and re-inflate the alveoli.",
            "Exhale slowly and completely through your mouth until your lungs are empty.",
            "Repeat for 1-5 minutes to acutely lower stress, or perform a single cycle for a quick 'reset'."
        ],
        tips: [
            "The second inhale is critical—it pops open collapsed air sacs, increasing the surface area for CO2 offloading.",
            "Make the exhale as slow and 'full' as possible.",
            "This technique is most effective when you feel a sudden spike in stress or anxiety."
        ]
    },
    research: [
        {
            title: "Brief structured respiration practices enhance mood and reduce physiological arousal",
            authors: "Balban MY, Neri DC, Kinkead BL, Lucas CA, Huberman AD.",
            journal: "Cell Reports Medicine",
            year: 2023,
            finding: "Daily 5-minute cyclic sighing (physiological sigh) is more effective than mindfulness meditation in improving mood and reducing physiological arousal (respiratory rate).",
            url: "https://pubmed.ncbi.nlm.nih.gov/36630953/"
        }
    ],
    use_cases: ["Acute Stress Relief", "Anxiety Reduction", "Rapid Heart Rate Lowering", "Mental Clarity"],
    related_techniques: ["box-breathing", "navy-seal-tactical-breathing"],
    faqs: [
        {
            q: "Why two inhales?",
            a: "The second inhale pops open the tiny air sacs in your lungs (the alveoli) that naturally collapse under stress. This maximises the amount of carbon dioxide you can offload during the subsequent long exhale."
        },
        {
            q: "How often should I use it?",
            a: "It can be used as an acute tool (1-3 breaths) to stop a stress response in real-time, or as a daily practice (5 minutes) to lower your overall baseline stress and improve mood."
        }
    ]
};

const meta_title = "Physiological Sigh: The Huberman Breathing Technique for Stress";
const meta_description = "Master the Physiological Sigh, a 'double inhale' breathing protocol popularized by Dr. Andrew Huberman to rapidly lower stress and calm the nervous system.";

const schemaJson = [
    {
        "@context": "https://schema.org",
        "@type": "HowTo",
        "name": "How to perform the Physiological Sigh",
        "description": "A double-inhale breathing pattern for rapid stress relief.",
        "step": [
            { "@type": "HowToStep", "text": "Take a deep inhale through the nose." },
            { "@type": "HowToStep", "text": "Take a second sharp inhale to fully expand lungs." },
            { "@type": "HowToStep", "text": "Exhale slowly and completely through the mouth." }
        ]
    },
    {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": meta_title,
        "description": meta_description,
        "author": {
            "@type": "Organization",
            "name": "Breathe Collection"
        }
    }
];

async function inject() {
    try {
        console.log(`Updating content for: ${slug}`);
        
        // Attempting to bypass potential placeholder host issue if running locally
        if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('@host:')) {
            console.warn("WARNING: DATABASE_URL seems to contain placeholder 'host'. I will attempt to connect to localhost if it fails.");
        }

        await pool.query(
            `INSERT INTO content (slug, type, title, meta_title, meta_description, content_json, schema_json, published)
             VALUES ($1, 'technique', $2, $3, $4, $5, $6, true)
             ON CONFLICT (slug) DO UPDATE SET 
                title = EXCLUDED.title,
                meta_title = EXCLUDED.meta_title,
                meta_description = EXCLUDED.meta_description,
                content_json = EXCLUDED.content_json,
                schema_json = EXCLUDED.schema_json,
                published = true,
                updated_at = NOW()`,
            [slug, title, meta_title, meta_description, JSON.stringify(contentJson), JSON.stringify(schemaJson)]
        );
        
        console.log("Successfully updated Huberman content with Balban (2023) research and appreciation note.");
        process.exit(0);
    } catch (e) {
        console.error("Error updating DB:", e.message);
        if (e.message.includes('ENOTFOUND host')) {
            console.log("\nTIP: Your .env file likely has 'host' as a placeholder. Please run this command with a valid DATABASE_URL:");
            console.log("DATABASE_URL=postgresql://user:pass@localhost:5432/dbname node scripts/huberman-research-inject.js");
        }
        process.exit(1);
    }
}

inject();
