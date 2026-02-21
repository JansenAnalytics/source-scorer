#!/usr/bin/env node
'use strict';

const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { classifyDomain } = require(path.join(__dirname, 'domain-tier.cjs'));

// ── CLI arg parsing ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opts = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    opts[key] = (args[i + 1] && !args[i + 1].startsWith('--')) ? args[++i] : true;
  }
}

if (!opts.url && require.main === module) {
  console.error('Usage: node score.cjs --url <url> [--content "text"] [--claim "claim"] [--json]');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function fetchUrl(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    let settled = false;
    const req = lib.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SourceScorer/1.0)' },
      timeout: timeoutMs
    }, (res) => {
      // Follow redirects (up to 3)
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308)
           && res.headers.location) {
        settled = true;
        return fetchUrl(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => {
        data += chunk;
        if (data.length > 500000) {
          // Enough content — resolve with what we have
          if (!settled) { settled = true; resolve(data); }
          req.destroy();
        }
      });
      res.on('end', () => { if (!settled) { settled = true; resolve(data); } });
      res.on('error', (e) => { if (!settled) { settled = true; reject(e); } });
    });
    req.on('error', (e) => { if (!settled) { settled = true; reject(e); } });
    req.on('timeout', () => { req.destroy(); if (!settled) { settled = true; reject(new Error('Request timed out')); } });
  });
}

// ── Scoring functions ─────────────────────────────────────────────────────────

function scoreHttps(url) {
  return url.startsWith('https://') ? 10 : 0;
}

function scoreContentDepth(text) {
  if (!text || text.trim().length === 0) return { points: 0, detail: 'no content' };

  const words = text.trim().split(/\s+/).length;
  let points = 0;
  let wordLabel;

  if (words > 2000) {
    points += 8;
    wordLabel = `${words.toLocaleString()} words`;
  } else if (words >= 500) {
    points += 5;
    wordLabel = `${words.toLocaleString()} words`;
  } else {
    points += 2;
    wordLabel = `${words.toLocaleString()} words`;
  }

  let hasCitations = false;
  let hasStudyRefs = false;

  // Citation patterns
  const citationPatterns = [/\[\d+\]/, /References:/i, /Bibliography/i, /doi:/i, /https?:\/\//];
  if (citationPatterns.some(p => p.test(text))) {
    hasCitations = true;
  }

  // Study/research language
  const studyPatterns = [/according to/i, /study shows/i, /research indicates/i, /studies show/i, /researchers found/i];
  if (studyPatterns.some(p => p.test(text))) {
    hasStudyRefs = true;
  }

  let bonuses = [];
  if (hasCitations) bonuses.push('has citation patterns');
  if (hasStudyRefs) bonuses.push('has research language');

  let bonus = 0;
  if (hasCitations) bonus += 4;
  if (hasStudyRefs) bonus += 3;

  points = Math.min(15, points + bonus);

  const detail = bonuses.length > 0
    ? `${wordLabel}, ${bonuses.join(', ')}`
    : wordLabel;

  return { points, detail, words };
}

function scoreCrossReference(claim) {
  if (!claim) return { points: 0, detail: 'no claim provided' };

  const kbDir = path.join(process.env.HOME || '/home/ajans', 'projects', 'knowledge-base');
  if (!fs.existsSync(kbDir)) {
    return { points: 0, detail: 'knowledge base not available' };
  }

  // Search all .md and .json files in kb for the claim keywords
  const keywords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  if (keywords.length === 0) return { points: 0, detail: 'claim too short to cross-reference' };

  let matchCount = 0;
  const matchedDocs = [];

  try {
    const walkDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (/\.(md|txt|json)$/.test(entry.name)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8').toLowerCase();
            const matched = keywords.filter(kw => content.includes(kw));
            if (matched.length >= Math.ceil(keywords.length * 0.5)) {
              matchCount++;
              matchedDocs.push(entry.name);
            }
          } catch { /* skip unreadable files */ }
        }
      }
    };
    walkDir(kbDir);
  } catch { /* kb not accessible */ }

  if (matchCount > 0) {
    return {
      points: 20,
      detail: `claim confirmed in ${matchCount} knowledge base document${matchCount > 1 ? 's' : ''}: ${matchedDocs.slice(0, 3).join(', ')}`
    };
  }

  return { points: 0, detail: 'no match in knowledge base' };
}

function getRecommendation(score, domainTier, url) {
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();

  if (score >= 80) {
    if (domainTier.tier === 1) return `Use with high confidence. ${domainTier.description} (${host}).`;
    if (domainTier.tier === 2) return `Use with high confidence. Reputable source (${host}).`;
    return `High credibility — reliable source.`;
  } else if (score >= 55) {
    if (domainTier.tier <= 3) return `Moderate credibility — suitable for supporting references. Cross-check key claims.`;
    return `Moderate credibility — use, but verify important claims with primary sources.`;
  } else if (score >= 30) {
    return `Low credibility — flag as unverified. Do not use as primary source without corroboration.`;
  } else {
    return `Unreliable — avoid or explicitly mark as speculation/anecdotal.`;
  }
}

function getLabel(score) {
  if (score >= 80) return '🟢 High credibility';
  if (score >= 55) return '🟡 Moderate credibility';
  if (score >= 30) return '🟠 Low credibility';
  return '🔴 Unreliable';
}

// ── Main scoring function (exported for use in add-finding.cjs) ───────────────

async function scoreSource({ url, content, claim }) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  const domainTier = classifyDomain(hostname);
  const httpsScore = scoreHttps(url);

  let resolvedContent = content;
  let fetchNote = null;

  if (!resolvedContent) {
    try {
      const raw = await fetchUrl(url);
      resolvedContent = stripHtml(raw);
    } catch (e) {
      fetchNote = `Could not fetch content (${e.message}) — content depth skipped`;
    }
  }

  const contentResult = resolvedContent
    ? scoreContentDepth(resolvedContent)
    : { points: 0, detail: fetchNote || 'no content' };

  const crossRefResult = scoreCrossReference(claim);

  // Consistency: default 10 in CLI (not implemented — reserved for research-reporter)
  const consistencyPoints = 10;
  const consistencyDetail = 'no data — skipped';

  const totalScore = Math.min(100,
    domainTier.points +
    httpsScore +
    contentResult.points +
    crossRefResult.points +
    consistencyPoints
  );

  const label = getLabel(totalScore);
  const recommendation = getRecommendation(totalScore, domainTier, url);

  return {
    url,
    domain: hostname.replace(/^www\./, ''),
    score: totalScore,
    label: label.replace(/^[^ ]+ /, ''), // without emoji for JSON clarity
    emoji_label: label,
    breakdown: {
      domain_tier: { points: domainTier.points, max: 35, tier: domainTier.tier, detail: domainTier.description },
      https: { points: httpsScore, max: 10 },
      content_depth: { points: contentResult.points, max: 15, detail: contentResult.detail },
      cross_reference: { points: crossRefResult.points, max: 20, detail: crossRefResult.detail },
      consistency: { points: consistencyPoints, max: 20, detail: consistencyDetail }
    },
    recommendation,
    fetch_note: fetchNote
  };
}

module.exports = { scoreSource };

// ── CLI output ────────────────────────────────────────────────────────────────

if (require.main === module) {
  scoreSource({ url: opts.url, content: opts.content, claim: opts.claim })
    .then(result => {
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const { url, domain, score, emoji_label, breakdown, recommendation, fetch_note } = result;

      // Pretty path for display
      let displayPath;
      try {
        const u = new URL(url);
        displayPath = u.hostname.replace(/^www\./, '') + u.pathname;
      } catch { displayPath = url; }

      console.log('');
      console.log(`Source Credibility Score: ${displayPath}`);
      console.log('');
      console.log(`Score: ${score}/100 — ${emoji_label}`);
      console.log('');
      console.log('Breakdown:');

      const pad = (str, len) => str.padEnd(len, ' ');
      const b = breakdown;
      console.log(`  ${pad('Domain tier', 18)}: ${pad(b.domain_tier.points + '/35', 7)} (${b.domain_tier.tier === 1 ? 'Tier 1' : b.domain_tier.tier === 2 ? 'Tier 2' : b.domain_tier.tier === 3 ? 'Tier 3' : b.domain_tier.tier === 4 ? 'Tier 4' : b.domain_tier.tier === 5 ? 'Tier 5' : 'Tier 6'} — ${b.domain_tier.detail})`);
      console.log(`  ${pad('HTTPS', 18)}: ${pad(b.https.points + '/10', 7)} ${b.https.points === 10 ? '✅' : '❌'}`);
      console.log(`  ${pad('Content depth', 18)}: ${pad(b.content_depth.points + '/15', 7)} (${b.content_depth.detail})`);
      console.log(`  ${pad('Cross-reference', 18)}: ${pad(b.cross_reference.points + '/20', 7)} (${b.cross_reference.detail})`);
      console.log(`  ${pad('Consistency', 18)}: ${pad(b.consistency.points + '/20', 7)} (${b.consistency.detail})`);

      if (fetch_note) {
        console.log('');
        console.log(`⚠️  Note: ${fetch_note}`);
      }

      console.log('');
      console.log(`Recommendation: ${recommendation}`);
      console.log('');
    })
    .catch(err => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}
