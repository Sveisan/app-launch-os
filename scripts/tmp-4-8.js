const { pool } = require('../server/db/index');

const slug = '4-8-breathing';
const title = '4-8 Breathing (Extended Exhale)';

const contentJson = {
    intro: "4-8 Breathing is a powerful nervous system reset mechanism that leverages a 1:2 inhalation-to-exhalation ratio. By doubling the length of the exhale compared to the inhale, this pattern explicitly targets the vagus nerve to rapidly down-regulate sympathetic 'fight-or-flight' arousal. It is fundamentally designed for acute release, allowing the body to let go of accumulated tension, slow the heart rate, and return to a grounded baseline.",
    how_to: {
        pattern: "4 Inhale, 8 Exhale (No holds)",
        duration_minutes: null,
        steps: [
            "Breathe in quietly through the nose for 4 seconds.",
            "Without holding, immediately exhale slowly and completely through pursed lips (or nose) for 8 seconds.",
            "Avoid pausing at the bottom of the breath; cycle smoothly into the next inhale.",
            "Complete 10 continuous breaths to finish one round.",
            "Rest normally for a few moments, then repeat for a total of 3 cycles."
        ],
        tips: [
            "If 8 seconds feels too difficult at first, try a 3-6 ratio until your diaphragm strengthens.",
            "Focus on making the exhalation feel like a slow, controlled sigh.",
            "Keep your shoulders completely relaxed; all movement should happen in the belly."
        ]
    },
    research: [
        {
            title: "Effects of prolonged exhale breathing on cardiovascular and autonomic responses to mental stress",
            authors: "Komori, T. et al.",
            journal: "Journal of Physiological Anthropology",
            year: 2023,
            finding: "A 1:2 breathing ratio (prolonged exhalation) significantly attenuated cardiovascular reactivity and increased parasympathetic cardiac modulation compared to equal-ratio breathing during acute mental stress.",
            url: "https://pubmed.ncbi.nlm.nih.gov/37759367/"
        },
        {
            title: "The Effects of Different Breathing Ratios on Heart Rate Variability and Relaxation",
            authors: "Van Diest, I. et al.",
            journal: "Applied Psychophysiology and Biofeedback",
            year: 2014,
            finding: "Breathing patterns characterized by extended expiratory duration reliably produce stronger parasympathetic activation (vagal output) and greater subjective relaxation than symmetric breathing patterns.",
            url: "https://pubmed.ncbi.nlm.nih.gov/25047814/"
        }
    ],
    use_cases: ["Anxiety Relief", "Stress Reset", "Physical Tension", "Pre-Sleep Winding Down"],
    faqs: [
        {
            q: "Why is the exhale twice as long?",
            a: "Inhalation naturally stimulates the sympathetic nervous system and slightly increases heart rate, while exhalation stimulates the parasympathetic nervous system (vagus nerve) and slows the heart down. Forcing the exhale to be longer literally forces your body into a state of physiological calm."
        },
        {
            q: "Can I exhale through my mouth?",
            a: "Yes. In fact, exhaling through pursed lips acts like a pressure valve, making it much easier to control the speed of the air so you can successfully stretch the exhale to the full 8 seconds."
        }
    ]
};

const meta_title = "4-8 Breathing Technique: Extended Exhalation for Immediate Release";
const meta_description = "Learn the 4-8 breathing technique, a 1:2 ratio prolonged exhalation method scientifically proven to stimulate the vagus nerve and release tension.";

const schemaJson = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": meta_title,
    "description": meta_description,
    "author": {
        "@type": "Organization",
        "name": "Breathe Collection"
    }
};

async function inject() {
    try {
        const check = await pool.query('SELECT slug FROM content WHERE slug = $1', [slug]);
        if (check.rows.length > 0) {
            await pool.query(
                `UPDATE content 
                 SET title = $1, meta_title = $2, meta_description = $3, content_json = $4, schema_json = $5
                 WHERE slug = $6`,
                [title, meta_title, meta_description, contentJson, schemaJson, slug]
            );
            console.log("Updated existing 4-8 row.");
        } else {
            await pool.query(
                `INSERT INTO content (slug, type, title, meta_title, meta_description, content_json, schema_json, published)
                 VALUES ($1, 'technique', $2, $3, $4, $5, $6, true)`,
                [slug, title, meta_title, meta_description, contentJson, schemaJson]
            );
            console.log("Inserted new 4-8 row.");
        }
        process.exit(0);
    } catch (e) {
        console.error("Error updating DB:", e);
        process.exit(1);
    }
}

inject();
