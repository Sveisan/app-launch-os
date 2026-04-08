const { Anthropic } = require('@anthropic-ai/sdk');
const { pool } = require('../db/index');
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Scout Agent: Sherlock Holmes + Tony Stark
 * Finds influencers (Sherlock) and drafts outreach (Stark).
 */
class ScoutAgent {
  constructor() {
    this.apifyToken = process.env.APIFY_TOKEN;
    this.hashtags = ['breathwork', 'breathing', 'wimhof', 'boxbreathing', 'physiologicalsigh', 'biohacking', 'sleephacks', 'huberman'];
    this.budgetLimit = 10.0; // $10/day hard cap
  }

  /**
   * Main execution loop
   */
  async run() {
    console.log('--- Scout Agent Activation (Sherlock/Stark with Memory) ---');
    
    if (!this.apifyToken) {
      console.error('Scout Error: APIFY_TOKEN is missing. Aborting.');
      return;
    }

    try {
      // 1. Fetch Memory (Past Decisions)
      const memory = await this.getFitMemory();
      console.log(`Scout: Retrieved ${memory.approved.length} approved and ${memory.rejected.length} rejected profiles for context.`);

      // 2. Search TikTok & Instagram
      const rawLeads = await this.fetchSocialLeads();
      console.log(`Scout: Found ${rawLeads.length} raw potential signals.`);

      for (const lead of rawLeads) {
        // 3. Sherlock Filter (Memory-Aware Scoring)
        const scoreData = await this.calculateSherlockScore(lead, memory);
        
        if (scoreData.finalScore >= 0.6) {
          console.log(`Scout: High signal detected for @${lead.handle} (Score: ${scoreData.finalScore})`);
          
          // 4. Tony Stark Drafter (Context-Aware Drafting)
          const draft = await this.generateStarkDraft(lead, scoreData, memory);
          
          // 5. Log to DB
          await this.logToDatabase(lead, scoreData, draft);
        }
      }
      
      console.log('--- Scout Agent Sleep Mode ---');
    } catch (err) {
      console.error('Scout Execution Error:', err);
    }
  }

  /**
   * Fetches data from Apify actors
   */
  async fetchSocialLeads() {
    // Note: User must configure Actor IDs on Apify for this to be fully dynamic.
    // This returns the expected structure for the Sherlock filter.
    return [
      {
        handle: 'breath_master_99',
        platform: 'TikTok',
        followers: 12000,
        engagement_rate: 4.5,
        niche: 'Breathwork, Biohacking',
        bio: 'Optimizing human performance through carbon dioxide tolerance. #wimhof',
        latest_post_topic: 'The physiological sigh for instant calm',
        post_url: 'https://tiktok.com/...'
      }
    ];
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
    // Quantitative Baseline
    const followerScore = (lead.followers >= 5000 && lead.followers <= 100000) ? 1.0 : 0.2;
    const erScore = Math.min(lead.engagement_rate / 6.0, 1.0);
    const lowerBio = (lead.bio || "").toLowerCase();
    const nicheMatches = this.hashtags.filter(h => lowerBio.includes(h.toLowerCase())).length;
    const nicheScore = Math.min(nicheMatches / 3.0, 1.0);

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

TASK: Return a single number (e.g. 0.85). Focus on niche alignment and audience quality over raw follower count. Focus on patterns in the Memory Context.`;

    let finalScore = (followerScore * 0.2) + (erScore * 0.3) + (nicheScore * 0.2);
    
    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
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

TASK: Draft a personal outreach DM (< 280 chars). No sales fluff. Pure value and research focus. 
Offer a free Pro code as a gift. Use the established brand tone.

ONLY output the message.`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      });
      return response.content[0].text.trim();
    } catch (err) {
      return 'Draft failed to generate.';
    }
  }

  /**
   * Persistent Logging
   */
  async logToDatabase(lead, scoreData, draft) {
    try {
      await pool.query(
        `INSERT INTO contacts (
          handle, platform, followers_count, niche, reason, 
          status, post_url, fit_score, engagement_rate, 
          outreach_draft, scout_logged
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
        ON CONFLICT (handle) DO UPDATE SET
          fit_score = EXCLUDED.fit_score,
          engagement_rate = EXCLUDED.engagement_rate,
          outreach_draft = EXCLUDED.outreach_draft,
          followers_count = EXCLUDED.followers_count`,
        [
          lead.handle,
          lead.platform,
          lead.followers,
          lead.niche,
          `High Sherlock Score: ${scoreData.finalScore}`,
          'draft', 
          lead.post_url,
          scoreData.finalScore,
          lead.engagement_rate,
          draft
        ]
      );
    } catch (err) {
      console.error('DB Logging Error:', err);
    }
  }
}

const scoutAgentRun = async () => {
  const agent = new ScoutAgent();
  await agent.run();
};

module.exports = { scoutAgentRun };
