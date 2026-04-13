const { ApifyClient } = require('apify-client');
const { Anthropic } = require('@anthropic-ai/sdk');
const { pool } = require('../db/index');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN,
});

/**
 * Scout Agent: Sherlock Holmes + Tony Stark
 * Finds influencers (Sherlock) and drafts outreach (Stark).
 */
class ScoutAgent {
  constructor() {
    this.apifyToken = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
    this.hashtags = []; // Loaded from DB
    this.budgetLimit = 10.0; // $10/day hard cap
  }

  /**
   * Loads search keywords from database with fallback
   */
  async loadKeywords() {
    try {
      const res = await pool.query('SELECT keyword FROM scout_keywords WHERE is_hashtag = TRUE');
      if (res.rows.length > 0) {
        this.hashtags = res.rows.map(r => r.keyword);
        await this.sysLog(`Loaded ${this.hashtags.length} keywords from database.`);
      } else {
        throw new Error('Keywords table is empty');
      }
    } catch (err) {
      await this.sysLog(`Keyword fetch failed, using fallback list. Error: ${err.message}`);
      this.hashtags = [
        'breathwork', 'breathing', 'wimhof', 'boxbreathing', 'physiologicalsigh', 
        'biohacking', 'sleephacks', 'huberman', 'wellness', 'yoga', 'meditation', 
        'mindfulness', 'healthylifestyle', 'stressrelief', 'recovery',
        'anxietyrelief', 'burnout', 'insomnia', 'panicattack', 'mentalhealth', 
        'stressmanagement', 'productivityhacks', 'focus', 'flowstate', 'peakperformance',
        'pust', 'pusteteknikk', 'stressmestring', 'biohackingnorge',
        'respiracion', 'meditacion', 'bienestar', 'biohacking', 'saludmental',
        'respiracao', 'bemestar', 'saudemental', 'ansiedade', 'estresse'
      ];
    }
  }

  /**
   * Main execution loop
   */
  async run() {
    await this.sysLog('--- Scout Agent Activation (Phase 3 Trace) ---');
    console.log('Checking configuration...');
    
    if (!this.apifyToken) {
      await this.sysLog('Aborted: APIFY_API_TOKEN is missing.');
      return;
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      await this.sysLog('Aborted: ANTHROPIC_API_KEY is missing.');
      return;
    }

    await this.loadKeywords();

    try {
      // 0. Schema Integrity Check (Bypassable)
      try {
        console.log('Scout: Checking Database schema integrity...');
        const schemaCheck = await pool.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'contacts' AND column_name = 'scout_logged'
        `);
        
        if (schemaCheck.rows.length === 0) {
          await this.sysLog('CRITICAL: contacts table is missing scout_logged column.');
        }
      } catch (err) {
        await this.sysLog(`Database Integrity Check failed (Bypassing): ${err.message}`);
      }

      // 1. Fetch Memory (Past Decisions)
      let memory = { approved: [], rejected: [] };
      try {
        memory = await this.getFitMemory();
        await this.sysLog(`Retrieved memory: ${memory.approved.length} approved, ${memory.rejected.length} rejected profiles.`);
      } catch (err) {
        await this.sysLog(`Memory retrieval failed (Using empty memory): ${err.message}`);
      }

      // 2. Search TikTok & Instagram
      const rawLeads = await this.fetchSocialLeads();
      await this.sysLog(`Fetched ${rawLeads.length} raw leads from Apify.`);
      
      // DEBUG: Log raw leads to file
      fs.writeFileSync(path.join(process.cwd(), 'docs/scout_raw_debug.json'), JSON.stringify(rawLeads, null, 2));

      for (const lead of rawLeads) {
        await this.sysLog(`Sherlock: Evaluating lead @${lead.handle}...`);
        
        // 3. Sherlock Filter (Memory-Aware Scoring)
        let scoreData;
        try {
          scoreData = await this.calculateSherlockScore(lead, memory);
          await this.sysLog(`Sherlock Score for @${lead.handle}: ${scoreData.finalScore}`);
        } catch (err) {
          await this.sysLog(`Sherlock assessment failed for @${lead.handle}: ${err.message}`);
          continue;
        }
        
        if (scoreData.finalScore >= 0.1) {
          await this.sysLog(`Entry Signal detected: Drafting Tony Stark message for @${lead.handle}...`);
          
          // 4. Tony Stark Drafter (Context-Aware Drafting)
          let draft;
          try {
            draft = await this.generateStarkDraft(lead, scoreData, memory);
          } catch (err) {
            await this.sysLog(`Tony Stark drafting failed for @${lead.handle}: ${err.message}`);
            draft = 'Draft failed to generate.';
          }
          
          // 5. Log to DB & Backup
          await this.logToDatabase(lead, scoreData, draft);
          await this.logToBackup(lead, scoreData, draft);
        } else {
          await this.sysLog(`Excluded @${lead.handle} (Score ${scoreData.finalScore} too low).`);
        }
      }
      
      await this.sysLog('--- Scout Agent returning to Sleep Mode ---');
    } catch (err) {
      await this.sysLog(`GLOBAL EXECUTION ERROR: ${err.message}`);
    }
  }

  async logToBackup(lead, scoreData, draft) {
    try {
      const docsDir = path.join(process.cwd(), 'docs');
      if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);
      
      const filePath = path.join(docsDir, 'scout_finds.md');
      const header = !fs.existsSync(filePath) 
        ? "# 🔭 Scout Findings (Fallback Log)\n\n| Handle | Platform | Score | Niche | Draft |\n|---|---|---|---|---|\n" 
        : "";
      
      const row = `| @${lead.handle} | ${lead.platform} | ${scoreData.finalScore} | ${lead.niche} | ${draft.replace(/\n/g, '<br>')} |\n`;
      
      fs.appendFileSync(filePath, header + row);
      console.log(`[Backup] Logged @${lead.handle} to docs/scout_finds.md`);
    } catch (err) {
      console.error('Backup Logging Failed:', err.message);
    }
  }

  async sysLog(message) {
    try {
      console.log(`[ScoutLog] ${message}`);
      await pool.query('INSERT INTO scout_logs (message) VALUES ($1)', [message]);
    } catch (err) {
      console.error('SysLog failure:', err);
    }
  }

  /**
   * Fetches data from Apify actors
   */
  async fetchSocialLeads() {
    const leads = [];
    const selectedHashtags = [];
    
    // Pick 2 unique random hashtags
    while(selectedHashtags.length < 2) {
      const h = this.hashtags[Math.floor(Math.random() * this.hashtags.length)];
      if (!selectedHashtags.includes(h)) selectedHashtags.push(h);
    }

    for (const hashtag of selectedHashtags) {
        console.log(`Scout: Sweeping social fields for #${hashtag}...`);
        await this.sysLog(`Sweeping #${hashtag}...`);

        try {
          // TikTok Sweep (clockworks/tiktok-scraper verified to work)
          const ttRun = await apifyClient.actor("clockworks/tiktok-scraper").call({
            hashtags: [hashtag],
            resultsPerPage: 20, // Increased results
            shouldDownloadVideos: false,
            shouldDownloadCovers: false
          });
          const { items: ttItems } = await apifyClient.dataset(ttRun.defaultDatasetId).listItems();
          
          if (ttItems.length === 0) {
            await this.sysLog(`TikTok: No items found for #${hashtag}.`);
          }

          ttItems.forEach(item => {
            const author = item.authorMeta || item.author;
            if (author) {
              const handle = author.name || author.uniqueId;
              const followers = author.fans || (author.stats && author.stats.followerCount) || 0;
              const diggCount = item.diggCount || (item.stats && item.stats.diggCount) || 0;
              const commentCount = item.commentCount || (item.stats && item.stats.commentCount) || 0;
              
              leads.push({
                handle: handle,
                platform: 'TikTok',
                followers: followers,
                engagement_rate: followers > 0 ? ((diggCount + commentCount) / followers * 100) : 0,
                niche: hashtag,
                bio: author.signature || "",
                post_caption: item.text || item.desc || "",
                post_url: item.webVideoUrl || `https://www.tiktok.com/@${handle}/video/${item.id}`
              });
            }
          });

          // Instagram Sweep (apify/instagram-hashtag-scraper)
          const igRun = await apifyClient.actor("apify/instagram-hashtag-scraper").call({
            hashtags: [hashtag],
            resultsLimit: 20 // Increased from 5
          });
          const { items: igItems } = await apifyClient.dataset(igRun.defaultDatasetId).listItems();

          if (igItems.length === 0) {
            await this.sysLog(`Instagram: No items found for #${hashtag}.`);
          }

          igItems.forEach(item => {
            leads.push({
              handle: item.ownerUsername || item.ownerId,
              platform: 'Instagram',
              followers: 0,
              engagement_rate: (item.likesCount / 100) || 0,
              niche: hashtag,
              bio: "", 
              post_caption: item.caption || "",
              post_url: item.url
            });
          });

        } catch (err) {
          console.error(`Scout Scraper Error for #${hashtag}:`, err.message);
        }
    }

    return leads;
  }

  /**
   * Memory Retrieval: Fetching previous signals
   */
  async getFitMemory() {
    try {
      const approved = await pool.query(
        "SELECT handle, niche, followers_count, fit_score FROM contacts WHERE status = 'approved' AND scout_logged = TRUE LIMIT 5"
      );
      const rejected = await pool.query(
        "SELECT handle, niche, followers_count, fit_score FROM contacts WHERE status = 'rejected' AND scout_logged = TRUE LIMIT 5"
      );
      return { approved: approved.rows, rejected: rejected.rows };
    } catch (err) {
      console.error('Memory Retrieval Error:', err);
      return { approved: [], rejected: [] };
    }
  }

  /**
   * Sherlock Logic: Finding signal in noise with behavioral memory
   */
  async calculateSherlockScore(lead, memory) {
    // Quantitative Baseline - Relaxed for testing (500+ followers)
    const followerScore = (lead.followers >= 500) ? 1.0 : 0.1;
    const erScore = Math.min((lead.engagement_rate || 0) / 6.0, 1.0);
    
    // Multi-dimensional Search: Bio + Post Captions
    const fullContext = `${lead.bio} ${lead.post_caption || ""}`.toLowerCase();
    const nicheMatches = this.hashtags.filter(h => fullContext.includes(h.toLowerCase())).length;
    const nicheScore = Math.min(nicheMatches / 1.0, 1.0); // 1.0 score if even 1 keyword matches

    // Qualitative Adjustment via Memory
    const memoryContext = `
APPROVED PROFILES (Favored traits):
${memory.approved.length ? memory.approved.map(p => `- @${p.handle}: ${p.niche} (${p.followers_count} followers)`).join('\n') : 'No history yet.'}

REJECTED PROFILES (Non-relevant traits):
${memory.rejected.length ? memory.rejected.map(p => `- @${p.handle}: ${p.niche} (${p.followers_count} followers)`).join('\n') : 'No history yet.'}
`;

    const prompt = `Evaluate the "Fit Score" (0.0 to 1.0) for this potential growth lead.

NEW PROFILE:
Handle: @${lead.handle}
Bio: ${lead.bio}
Followers: ${lead.followers}

MEMORY CONTEXT:
${memoryContext}

TASK: Return a single number (e.g. 0.85). 
- 1.0 = Perfect Breathwork/Biohacking match.
- 0.8-0.9 = High-quality Wellness/Yoga creator.
- 0.7 = Creator discussing SYMPTOMS (Anxiety, Stress, Burnout, Sleep issues, Lack of Focus).
- 0.5 = General Health/Fitness creator with good aesthetic.

IMPORTANT: The profile bio and content may be in English, Norwegian, Spanish, Portuguese, or other languages.
- Keywords to look for: Pust/Respiracion/Respiracao (Breath), Stress/Estres/Estresse (Stress), Bienestar/Bem-estar (Wellness).
Evaluate based on CORE INTENT and scientific/premium aesthetic, regardless of language.
Prioritize creators who mention pain points (stress, tired, focus, panic) even if they don't know the breathwork solution yet.`;

    let finalScore = (followerScore * 0.2) + (erScore * 0.3) + (nicheScore * 0.2);
    
    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 10,
        messages: [{ role: 'user', content: prompt }]
      });
      const aiAdjustment = parseFloat(response.content[0].text);
      if (!isNaN(aiAdjustment)) {
        finalScore = (finalScore * 0.6) + (aiAdjustment * 0.4);
      }
    } catch (err) {
      console.error('Qualitative Scoring Error:', err);
    }

    return {
      finalScore: parseFloat(finalScore.toFixed(2)),
      breakdown: { followerScore, erScore, nicheScore }
    };
  }

  async generateStarkDraft(lead, scoreData, memory) {
    const memoryDraftContext = memory.approved.length > 0 
      ? `Preferred outreach styles for these creators: ${memory.approved.map(p => p.handle).join(', ')}.` 
      : "";

    const prompt = `You are the Growth Agent for "Breathe Collection" (Quiet Luxury, Science-backed).
Your persona: Sherlock Holmes (logic) + Tony Stark (efficiency).

INFLUENCER DATA:
Handle: @${lead.handle} (${lead.platform})
Niche: ${lead.niche}
Sherlock Score: ${scoreData.finalScore}/1.0
${memoryDraftContext}

EVALUATION CRITERIA:
- Niche Fit: Does their content align with wellness, biohacking, or high-performance living?
- Aesthetic: Does their brand feel "Quiet Luxury" and premium?

Respond in JSON format:
{
  "score_adjustment": number (-0.2 to +0.2),
  "reasoning": "string",
  "draft": "A short, premium outreach message from Sveisan/Breathe Collection."
}

Keep the draft visionary, direct, and slightly exclusive.`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }]
      });
      
      const content = response.content[0].text;
      // Extract JSON if Claude wrapped it in markdown
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const cleanJson = jsonMatch ? jsonMatch[0] : content;
      
      const result = JSON.parse(cleanJson);
      return result.draft || 'Draft generated but missing field.';
    } catch (err) {
      console.error('Tony Stark Drafting Error:', err.message);
      return `Draft failed: ${err.message}`;
    }
  }

  /**
   * Persistent Logging (Honest & Schema-Aligned)
   */
  async logToDatabase(lead, scoreData, draft) {
    try {
      await pool.query(
        `INSERT INTO contacts (
          handle, platform, followers, followers_count, niche, reason, 
          status, post_url, fit_score, engagement_rate, 
          outreach_draft, bio, post_caption, scout_logged, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE, NOW())
        ON CONFLICT (handle, platform) DO UPDATE SET
          fit_score = EXCLUDED.fit_score,
          engagement_rate = EXCLUDED.engagement_rate,
          outreach_draft = EXCLUDED.outreach_draft,
          followers = EXCLUDED.followers,
          followers_count = EXCLUDED.followers_count,
          bio = EXCLUDED.bio,
          post_caption = EXCLUDED.post_caption,
          scout_logged = TRUE,
          created_at = NOW()`,
        [
          lead.handle,
          lead.platform,
          String(lead.followers), // Mapping to 'followers' (string)
          parseInt(lead.followers) || 0, // Mapping to 'followers_count' (number)
          lead.niche,
          `High Sherlock Score: ${scoreData.finalScore}`,
          'draft', 
          lead.post_url,
          scoreData.finalScore,
          lead.engagement_rate,
          draft,
          lead.bio || '',
          lead.post_caption || ''
        ]
      );
      await this.sysLog(`SUCCESS: Fully Logged @${lead.handle} to database leads list.`);
    } catch (err) {
      console.error('DB Logging Error:', err);
      await this.sysLog(`LOGGING ERROR FOR @${lead.handle}: ${err.message}`);
    }
  }
}

const scoutAgentRun = async () => {
  const agent = new ScoutAgent();
  await agent.run();
};

module.exports = { ScoutAgent, scoutAgentRun };
