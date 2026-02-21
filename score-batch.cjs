#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { scoreSource } = require(path.join(__dirname, 'score.cjs'));

// ── CLI arg parsing ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opts = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    opts[key] = (args[i + 1] && !args[i + 1].startsWith('--')) ? args[++i] : true;
  }
}

if (!opts['urls-file']) {
  console.error('Usage: node score-batch.cjs --urls-file <file> [--output scores.json]');
  process.exit(1);
}

const urlsFile = opts['urls-file'];
if (!fs.existsSync(urlsFile)) {
  console.error(`Error: File not found: ${urlsFile}`);
  process.exit(1);
}

const urls = fs.readFileSync(urlsFile, 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));

if (urls.length === 0) {
  console.error('No URLs found in file.');
  process.exit(1);
}

console.log(`\nScoring ${urls.length} URL${urls.length !== 1 ? 's' : ''}...\n`);

async function main() {
  const results = [];

  for (const url of urls) {
    process.stdout.write(`  Scoring: ${url.length > 60 ? url.slice(0, 57) + '...' : url} ... `);
    try {
      const result = await scoreSource({ url });
      results.push(result);
      process.stdout.write(`${result.score}/100 ${result.emoji_label}\n`);
    } catch (e) {
      process.stdout.write(`ERROR: ${e.message}\n`);
      results.push({ url, score: 0, emoji_label: '🔴 Unreliable', label: 'Error', error: e.message });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // ── Print table ─────────────────────────────────────────────────────────────
  console.log(`\nCredibility Rankings (${results.length} sources):\n`);

  const rankW = 5, scoreW = 7, labelW = 20;
  const header = `${'Rank'.padEnd(rankW)}  ${'Score'.padEnd(scoreW)}  ${'Label'.padEnd(labelW)}  URL`;
  console.log(header);
  console.log('─'.repeat(Math.min(header.length + 30, 120)));

  results.forEach((r, i) => {
    const rank = String(i + 1).padEnd(rankW);
    const score = String(r.score).padEnd(scoreW);
    const label = (r.emoji_label || '🔴 Unreliable').padEnd(labelW);
    console.log(`${rank}  ${score}  ${label}  ${r.url}`);
  });

  console.log('');

  // ── Save JSON if requested ───────────────────────────────────────────────────
  if (opts.output) {
    fs.writeFileSync(opts.output, JSON.stringify(results, null, 2));
    console.log(`Saved to ${opts.output}`);
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
