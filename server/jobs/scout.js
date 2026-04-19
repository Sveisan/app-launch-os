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
    this.deepMemoryPersona = ""; // Distilled from approvals/rejections
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
    await this.refreshDeepMemory();

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

      const topLeads = [];
      for (const lead of rawLeads) {
        await this.sysLog(`Sherlock: Evaluating lead @${lead.handle}...`);
        
        // 3. Sherlock Filter (Memory-Aware Scoring)
        let scoreData;
        try {
          // Safety Check: Instantly skip if handle is in blocklist
          const blockCheck = await pool.query('SELECT 1 FROM scout_blocklist WHERE target = $1', [lead.handle.replace('@', '')]);
          if (blockCheck.rows.length > 0) {
            await this.sysLog(`SAFETY: Skipping blocked handle @${lead.handle}.`);
            continue;
          }

          scoreData = await this.calculateSherlockScore(lead, memory);
          await this.sysLog(`Sherlock Score for @${lead.handle}: ${scoreData.finalScore}`);
          if (scoreData.finalScore >= 0.7) {
            topLeads.push({ ...lead, score: scoreData.finalScore });
          }
        } catch (err) {
          await this.sysLog(`Sherlock assessment failed for @${lead.handle}: ${err.message}`);
          continue;
        }
        
        if (scoreData.finalScore >= 0.6) {
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
      
      // 6. Keyword Evolution (Suggest new hashtags)
      try {
        if (topLeads.length > 0) {
          await this.suggestNewKeywords(topLeads);
        }
      } catch (err) {
        await this.sysLog(`Keyword suggestion failed: ${err.message}`);
      }
      
      // 7. Auto-promote suggested keywords
      try {
        const promoted = await pool.query(`
          INSERT INTO scout_keywords (keyword, language, is_hashtag)
          SELECT keyword, 'en', TRUE
          FROM scout_keyword_suggestions
          WHERE suggestion_count >= 3
          ON CONFLICT (keyword) DO NOTHING
          RETURNING keyword
        `);
        if (promoted.rows.length > 0) {
          await this.sysLog(`Auto-promoted keywords: ${promoted.rows.map(r => r.keyword).join(', ')}`);
        }
      } catch (err) {
        await this.sysLog(`Auto-promotion failed: ${err.message}`);
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

    // Weighted round-robin: prioritise high-yield, least-recently-used keywords
    const kwRes = await pool.query(`
      SELECT keyword FROM scout_keywords
      WHERE is_hashtag = TRUE
      ORDER BY
        yield_score DESC,           -- higher yield = picked more often
        last_used_at ASC NULLS FIRST -- least recently used first
      LIMIT 2
    `);
    const selectedHashtags = kwRes.rows.map(r => r.keyword);

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

        // Count quality leads found for this hashtag to update yield
        const yieldCount = leads.filter(l => l.niche === hashtag && (l.score || 0) >= 0.7).length;
        const newYield = Math.min(0.5 + (yieldCount * 0.1), 1.0); // bump by 0.1 per quality lead, cap at 1.0
        await pool.query(`
          UPDATE scout_keywords
          SET yield_score = (yield_score * 0.7 + $1 * 0.3), last_used_at = NOW()
          WHERE keyword = $2
        `, [newYield, hashtag]);
    }

    return leads;
  }

  /**
   * Memory Retrieval: Fetching previous signals
   * FIX: Now correctly uses 'pipeline_status' instead of legacy 'status'
   */
  async getFitMemory() {
    try {
      const approved = await pool.query(
        "SELECT handle, niche, bio, post_caption, fit_score FROM contacts WHERE pipeline_status = 'approved' AND scout_logged = TRUE LIMIT 20"
      );
      const rejected = await pool.query(
        "SELECT handle, niche, bio, post_caption, fit_score FROM contacts WHERE pipeline_status = 'rejected' AND scout_logged = TRUE LIMIT 20"
      );
      return { approved: approved.rows, rejected: rejected.rows };
    } catch (err) {
      console.error('Memory Retrieval Error:', err);
      return { approved: [], rejected: [] };
    }
  }

  /**
   * Deep Memory: Distill approvals/rejections into a "Target Persona"
   */
  async refreshDeepMemory() {
    try {
      const { approved, rejected } = await this.getFitMemory();
      
      if (approved.length === 0 && rejected.length === 0) {
        this.deepMemoryPersona = "Targeting high-quality wellness and performance creators with a 'Quiet Luxury' aesthetic.";
        return;
      }

      const prompt = `Analyze these Approved vs Rejected influencer profiles for the brand "Breathe Collection".
      
APPROVED: ${approved.map(p => `@${p.handle} (${p.niche}): ${p.bio}`).join(' | ')}
REJECTED: ${rejected.map(p => `@${p.handle} (${p.niche}): ${p.bio}`).join(' | ')}

Based on these decisions, describe the "Ideal Lead Persona" for this brand in 2 sentences. 
Focus on aesthetic, content style, and niche patterns.
Additionally: Ideal creators are evidence-led, not inspiration-led. They cite sources (Huberman, Wim Hof, sports science). 
They do not post challenge content, streak countdowns, or trend reactions. 
Penalise creators whose style resembles a wellness lifestyle brand. Reward creators whose style resembles a performance coach.`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }]
      });

      this.deepMemoryPersona = response.content[0].text;
      await this.sysLog(`Deep Memory Updated: ${this.deepMemoryPersona}`);

      // Persist to DB
      await pool.query(`
        INSERT INTO scout_memory (persona_insight, approved_count, rejected_count, updated_at)
        VALUES ($1, $2, $3, NOW())
      `, [this.deepMemoryPersona, approved.length, rejected.length]);

    } catch (err) {
      await this.sysLog(`Deep Memory refresh failed: ${err.message}`);
    }
  }

  /**
   * Sherlock Logic: Finding signal in noise with behavioral memory
   */
  async calculateSherlockScore(lead, memory) {
    // Quantitative Baseline - Proof of Reach
    let followerScore;
    if (lead.platform === 'Instagram') {
      followerScore = 0.5; // Neutral — IG follower count unavailable from hashtag scraper
    } else {
      followerScore = (lead.followers >= 1500) ? 1.0 : 0.0;
    }
    
    // Engagement Quality (Min 1.5% for "proven" interaction)
    const er = lead.engagement_rate || 0;
    const erScore = Math.min(er / 6.0, 1.0);
    const erPenalty = (lead.platform === 'Instagram')
      ? (er < 2.0 ? -0.5 : 0)   // IG: higher bar since no follower validation
      : (er < 1.5 ? -0.5 : 0);
    
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

DEEP INSIGHT (Your established preference):
${this.deepMemoryPersona}

TASK: Return a single number (0.0 to 1.0). 

REWARD (score higher):
- Mentions nervous system, Huberman, Wim Hof, cold exposure, CO2 tolerance, or breathwork science.
- Minimalist content style — no on-screen text spam, no trend chasing.
- Performance framing: athletes, military, biohackers, executives.
- Evidence-led content — creator cites sources, not just shares feelings.
- Audience follows for information, not entertainment.

PENALISE (score lower):
- Gamification aesthetics: challenge posts, streaks, "day X of Y" countdowns.
- TikTok-style reaction or trend content.
- Generic "self-care" or "wellness journey" framing.
- Heavy filter usage, lifestyle influencer aesthetic unrelated to physiology.
- Content style resembling Breathwrk, Calm, or Headspace — their audience has already decided gamified apps aren't for them.

SCORING GUIDE:
- 1.0 = Evidence-led breathwork/biohacking creator, premium/minimalist aesthetic.
- 0.8-0.9 = High-quality nervous system / performance creator, proven engagement.
- 0.7 = Creator discussing symptoms (anxiety, burnout, sleep, stress) with scientific framing.
- < 0.5 = Generic wellness, lifestyle, or trend content regardless of follower count.

IMPORTANT: Prioritize accounts that match the DEEP INSIGHT persona. 
Prioritize accounts that feel like they have a "Cinematic" or "Quiet Luxury" brand.
Prioritize creators who mention pain points (stress, tired, focus, panic) even if they don't know the breathwork solution yet.`;

    let finalScore = (followerScore * 0.2) + (erScore * 0.3) + (nicheScore * 0.2) + erPenalty;
    finalScore = Math.max(0, finalScore); // Ensure it doesn't go negative
    
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
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
Caption: ${lead.post_caption || 'Not available'}
Sherlock Score: ${scoreData.finalScore}/1.0
${memoryDraftContext}

OUTREACH ANGLE — choose the best fit based on creator type:
1. PHYSICAL PRACTICE creator (breath holds, box breathing, eyes-closed sessions):
   → Lead with: screen-off + haptic guidance angle — "designed to be used eyes closed, guided by touch, no screen needed"
2. REVIEWER / COMPARISON creator (reviews apps, compares protocols):
   → Lead with: science-bundling angle — "9 validated protocols in one app — Wim Hof, box breathing, physiological sigh, CO2 tables"
3. ANTI-GAMIFICATION creator (audience complains about Breathwrk / streak apps):
   → Lead with: no-streak, no-gamification angle — "no streaks, no points, just the practice"

Match the angle to the creator's content. If unsure, default to angle 1.
Keep the draft under 80 words. Direct, slightly exclusive, no emojis.`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
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
  /**
   * Keyword Evolution: Suggest new hashtags based on successful leads
   */
  async suggestNewKeywords(topLeads) {
    try {
      const prompt = `Analyze these high-quality leads for the brand "Breathe Collection" (Quiet Luxury, Biohacking).
      
LEADS: ${topLeads.map(l => `@${l.handle}: ${l.bio} (niche: ${l.niche})`).join(' | ')}

Based on their bios and niche, suggest 3 highly specific NEW hashtags (without the #) that we should try searching for. 
Format: Return only the keywords separated by commas.`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 50,
        messages: [{ role: 'user', content: prompt }]
      });

      const suggestions = response.content[0].text.split(',').map(s => s.trim().toLowerCase());
      await this.sysLog(`Growth Opportunity: Suggested new hashtags: ${suggestions.join(', ')}`);

      for (const kw of suggestions) {
        await pool.query(`
          INSERT INTO scout_keyword_suggestions (keyword, suggestion_count, last_seen_at)
          VALUES ($1, 1, NOW())
          ON CONFLICT (keyword) DO UPDATE SET
            suggestion_count = scout_keyword_suggestions.suggestion_count + 1,
            last_seen_at = NOW()
        `, [kw]);
      }
    } catch (err) {
      console.error('Keyword Suggestion Error:', err.message);
    }
  }
}

const scoutAgentRun = async () => {
  const agent = new ScoutAgent();
  await agent.run();
};

module.exports = { ScoutAgent, scoutAgentRun };
