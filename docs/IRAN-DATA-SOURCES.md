# Rank and backlink data for the Iranian market

**DataForSEO cannot be the plan.** Section 6.2 of its Terms of Service does not allow customers located, incorporated or established in Iran, and failing to comply deactivates the account. The integration stays in the code for operators outside those terms.

| Source | Data | Cost | Coverage | Limit | Status in this product |
|---|---|---|---|---|---|
| CSV import | Ranks and backlinks from any tool the customer already uses | Free | The customer's own exports | Manual, depends on the customer | Built and tested |
| Search Console, automatic | Average position per tracked keyword, own site | Free | Sites the customer verified | Average, not an exact daily rank. Needs Google OAuth from your environment | Built, tested against a mock |
| Common Crawl domain graph | Referring domains for any domain | Free download, large | About quarterly | Domains only, no pages or anchors. Partial web | Script built, tested on a small sample |
| Iranian SERP API, for example serpapi.ir | Exact rank per keyword, competitors too | Toman, per their pricing | To confirm | Not evaluated: its pages could not be read here | Not integrated, needs its API documentation |

## Recommended setup

1. Launch with CSV import and Search Console. Neither needs a foreign paid account.
2. Run the Common Crawl import after each release.
3. Evaluate an Iranian SERP API for exact ranks and competitor tracking.

## Importing

- Search Console: Performance > Export > CSV, then upload `Queries.csv`. Links > Export for top linking sites.
- Any tool: a CSV with a query and position column, or a source URL column. English and Persian headers are recognised.

Check each provider's terms yourself, and get legal advice on sanctions questions: this document is not legal advice.
