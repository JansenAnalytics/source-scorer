# source-scorer

A source credibility scorer for web research. Scores URLs on a 0–100 scale based on domain quality, HTTPS, content depth, and cross-referencing against a knowledge base.

## Scoring model

| Factor          | Max pts | Description                                      |
|-----------------|---------|--------------------------------------------------|
| Domain tier     | 35      | Official docs > major tech > publications > Q&A  |
| HTTPS           | 10      | Secure connection                                |
| Content depth   | 15      | Word count + citation patterns                   |
| Cross-reference | 20      | Claim confirmed in knowledge base                |
| Consistency     | 20      | Not contradicted (default: assume consistent)    |

**Labels:** 🟢 High (80+) · 🟡 Moderate (55–79) · 🟠 Low (30–54) · 🔴 Unreliable (<30)

## Usage

```bash
# Score a single URL (auto-fetches content)
node score.cjs --url "https://docs.stripe.com/webhooks"

# Score with provided content
node score.cjs --url "https://stripe.com/blog" --content "$(cat article.txt)"

# Score with a claim for cross-referencing
node score.cjs --url "https://stripe.com/docs" --claim "webhook signature verification"

# JSON output for piping
node score.cjs --url "https://..." --json

# Batch score from file
node score-batch.cjs --urls-file urls.txt [--output scores.json]

# Check domain tier
node domain-tier.cjs docs.stripe.com
```

## Integration

`research-reporter/add-finding.cjs` automatically scores sources when `--url` is provided.

## No dependencies

CommonJS only — works with any Node.js v14+, no npm install required.
