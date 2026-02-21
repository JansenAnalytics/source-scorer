#!/usr/bin/env node
'use strict';

const path = require('path');
const tiers = require(path.join(__dirname, 'tiers.json'));

/**
 * Classify a hostname into a tier.
 * Returns { tier, points, label, description }
 */
function classifyDomain(hostname) {
  // Strip www. prefix
  const host = hostname.replace(/^www\./, '').toLowerCase();

  // ── Tier 1: pattern match (prefix of hostname, OR TLD match) ──────────────
  for (const pattern of tiers.tier1_patterns) {
    if (pattern.startsWith('.')) {
      // TLD-style: .gov, .edu, .mil  — hostname must end with the pattern
      if (host.endsWith(pattern) || host.includes(pattern + '.')) {
        return { tier: 1, points: 35, label: 'Tier 1', description: 'Official / government / academic / standards body' };
      }
    } else if (pattern.includes('.org') || pattern.includes('.com') || pattern.includes('.net')) {
      // Exact full-domain patterns like "ietf.org", "w3.org"
      if (host === pattern || host.endsWith('.' + pattern)) {
        return { tier: 1, points: 35, label: 'Tier 1', description: 'Official / government / academic / standards body' };
      }
    } else {
      // Prefix patterns like "docs.", "developer.", "api."
      if (host.startsWith(pattern)) {
        return { tier: 1, points: 35, label: 'Tier 1', description: 'Official documentation subdomain' };
      }
    }
  }

  // ── Tier 2: exact hostname match ──────────────────────────────────────────
  if (tiers.tier2_exact.includes(host)) {
    return { tier: 2, points: 28, label: 'Tier 2', description: 'Major tech company domain' };
  }

  // ── Tier 3: exact hostname match ──────────────────────────────────────────
  if (tiers.tier3_exact.includes(host)) {
    return { tier: 3, points: 20, label: 'Tier 3', description: 'Well-known tech publication or academic preprint' };
  }

  // ── Tier 4: exact hostname match ──────────────────────────────────────────
  if (tiers.tier4_exact.includes(host)) {
    return { tier: 4, points: 12, label: 'Tier 4', description: 'Q&A site or developer community' };
  }

  // ── Tier 5: exact hostname match ──────────────────────────────────────────
  if (tiers.tier5_exact.includes(host)) {
    return { tier: 5, points: 5, label: 'Tier 5', description: 'Blogging platform or aggregator' };
  }

  // ── Tier 6: exact hostname match ──────────────────────────────────────────
  if (tiers.tier6_exact.includes(host)) {
    return { tier: 6, points: 0, label: 'Tier 6', description: 'Social media, forum, or anonymous post' };
  }

  // ── Unknown: charitable Tier 4 (12 pts) for personal blogs ────────────────
  return { tier: 4, points: 12, label: 'Tier 4 (unknown)', description: 'Personal blog or unknown domain' };
}

module.exports = { classifyDomain };

// ── CLI entrypoint ────────────────────────────────────────────────────────────
if (require.main === module) {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node domain-tier.cjs <hostname-or-url>');
    process.exit(1);
  }

  let hostname;
  try {
    // Accept full URLs too
    hostname = input.startsWith('http') ? new URL(input).hostname : input;
  } catch {
    hostname = input;
  }

  const result = classifyDomain(hostname);
  const clean = hostname.replace(/^www\./, '');
  console.log(`${clean}: ${result.label} (${result.points}/35) — ${result.description}`);
}
