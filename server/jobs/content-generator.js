const { Anthropic } = require('@anthropic-ai/sdk');
const { pool } = require('../db/index');
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, 
});

async function generateContent(topic) {
  console.log(`Generating content for ${topic.slug}...`);
  
  const systemPrompt = `You are an expert neuroscientist, elite breathing coach, and technical content writer.
Your job is to generate the JSON content for a premium breathing app's website ("Breathe Collection").
The brand aesthetic is "Quiet Luxury", heavily grounded in science and protocols (think Andrew Huberman or Navy SEALs).
You MUST output ONLY valid JSON without any markdown formatting wrappers.
CRITICAL: When generating "research" citations, you MUST only use real, verifiable scientific studies. Do not hallucinate PMIDs or URLs. If you cannot find a real study, leave the research array empty.
Limit output to a maximum of 3 use_cases, 3 research studies, and 3 FAQs to ensure the JSON does not exceed output token limits.
Return JSON that strictly matches this structure:
{
  "meta_title": "SEO title (under 60 chars)",
  "meta_description": "SEO description (under 160 chars)",
  "schema_json": [ /* array containing Schema.org JSON-LD for HowTo, FAQPage, and Article */ ],
  "content_json": {
    "intro": "2-3 sentence overview",
    "how_to": { /* ONLY IF IT IS A TECHNIQUE */
      "pattern": "e.g. 4-4-4-4",
      "duration_minutes": 5,
      "steps": ["Sit upright...", "Inhale for 4 counts..."],
      "tips": ["Start with 3 minutes..."]
    },
    "mechanism": "2-3 sentences explaining exactly how this works neurologically/physiologically (for use-cases mainly)",
    "research": [ /* array of real studies */
      {
        "title": "Study title",
        "authors": "Smith J, et al.",
        "journal": "Frontiers in Psychology",
        "year": 2017,
        "finding": "One sentence key finding.",
        "url": "https://pubmed.ncbi.nlm.nih.gov/..."
      }
    ],
    "use_cases": ["Focus", "Stress relief"],
    "related_techniques": ["box-breathing", "wim-hof"], /* string array of relevant slugs */
    "faqs": [
      { "q": "How long should I practice?", "a": "..." }
    ]
  }
}`;

  const userPrompt = `Generate the structured content for this topic:
Slug: ${topic.slug}
Type: ${topic.type}
Title: ${topic.title}
Context: ${topic.context}

Please provide ONLY the raw JSON output.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', // Using the latest 4.6 model available on the workspace
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    let jsonStr = response.content[0].text;
    
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }
    
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('Failed to parse JSON. Raw output from Claude:', response.content[0].text);
      throw parseErr;
    }

    await pool.query(
      `INSERT INTO content (slug, type, title, meta_title, meta_description, content_json, schema_json, published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
       ON CONFLICT (slug) DO UPDATE SET 
        content_json = EXCLUDED.content_json,
        schema_json = EXCLUDED.schema_json,
        meta_title = EXCLUDED.meta_title,
        meta_description = EXCLUDED.meta_description,
        updated_at = NOW()`,
      [
        topic.slug,
        topic.type,
        topic.title,
        parsed.meta_title || topic.title,
        parsed.meta_description || '',
        JSON.stringify(parsed.content_json || {}),
        JSON.stringify(parsed.schema_json || {})
      ]
    );

    console.log(`Draft generated and saved: /breathing/${topic.slug}`);
    return true;
  } catch (err) {
    console.error(`Error generating content for ${topic.slug}:`, err);
    return false;
  }
}

module.exports = { generateContent };
