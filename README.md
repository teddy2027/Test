# DualEntry | Portfolio Intelligence

**One portfolio. One financial picture. Better decisions.**

A fully interactive prototype of a sponsor-level portfolio financial monitoring, benchmarking and cross-portfolio intelligence product, designed as a proposed extension of DualEntry's AI-native ERP.

> **Concept demo · fictional data.** Northbridge Equity Partners, its two funds, all twelve portfolio companies, every person named and every figure are fictional and generated synthetically. Accounting-system assignments (e.g. "uses NetSuite") are fictional attributes, not statements about any real company. This is not a live DualEntry product and it is not affiliated with or endorsed by DualEntry.

---

## What it does

Three menu items — **Portfolio**, **Insights**, **Data Connections**. Every company list, comparison and "add" lives in exactly one place; company pages, side-by-side comparison and the quarterly pack open from Portfolio.

| View | What an operating partner can do |
|---|---|
| **Portfolio** | KPI cards (revenue, growth, EBITDA, margin, operating cash flow, companies reporting) with QoQ / YoY / budget comparison and an *Aggregate (Σ) vs Average company* toggle; "needs attention / outperforming / data gaps" signals; quarterly trend chart; **one comparison chart** — any performance or cost measure by company, optionally **grouped by** sector, business model, fund, revenue band or vintage with a median per group (no median below 3 companies), which is the cost benchmarking; the company table (sortable, searchable, optional cost columns, totals row, CSV export) where you **tick 2–5 companies → Compare**; **Add company**; **Quarterly pack** (printable / CSV). |
| **Insights** | Deterministic insight engine (growth, profitability, cost efficiency, cash flow, reporting quality) with drill-down drawers; labor-vs-revenue spotlight; **Ask Your Portfolio** natural-language analyst. |
| **Company page** (from the table, sidebar or search) | Header context, KPI strip, charts, **How it compares with peers** (peer rule, n, median/average, rank, small-cohort warnings, trend vs peer median, CSV), Income Statement / Cash Flow / Budget vs Actual / Operating KPIs / Entities tabs, company insights, data quality; uploads and Explore DualEntry for upload companies, the share scope for DualEntry companies. |
| **Compare** (from ticked rows) | 2–5 companies side by side: KPI cards, trend, bars, difference table with notable deviations, CSV. |
| **Data Connections** | Two connection types — *DualEntry · live* and *Uploaded by Northbridge*; a plain **Upload vs DualEntry** table (what each route delivers, timeliness, Northbridge effort, one live organic-growth example); upload-effort panel; invite pipeline; inventory with upload and Explore actions. |
| **Adding companies & uploads** | *Add company* (on Portfolio): on DualEntry → a data-share request the company approves in DualEntry ("company publishes, Northbridge subscribes": level of detail, entities, statements, closed months by default, hidden accounts, audience, preview as Northbridge, second approver for entity-level books). Not on DualEntry → Northbridge uploads the monthly pack: CSV template, example file, validation (control totals, duplicates, restatements with reason, swings without a note), preview, version history, and the honest limits of a file. |
| **Explore DualEntry** | Per upload company: why it's worth it for that company (from data Northbridge already has) → *Send DualEntry invite*: an email sent from Portfolio Intelligence in the operating partner's name to the CFO, CC the routed rep, with one unique link → the CFO books a demo on that rep's calendar and/or opens a sandbox with sample data → progress updates automatically (invite sent, demo booked, sandbox opened, then DualEntry-side stages). Northbridge sees milestones only. |

Global header: fund, period type (quarter / YTD / TTM / FY), reporting period, comparison basis, industry, vintage, business model, geography, investment-date range, reset, USD indicator, ⌘K search, watchlist, methodology, demo user menu.

---

## Quick start

Requirements: **Node.js 18.18+** (tested on Node 22) and npm.

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build and local serve:

```bash
npm run build
npm start            # http://localhost:3000
```

No database, credentials, API keys or external services are required. Everything runs locally from a deterministic, seeded dataset.

### Verification

```bash
npm run typecheck    # TypeScript (strict)
npm run lint         # ESLint, zero warnings allowed
npm test             # Vitest: calculations, aggregation, data integrity, insights, query parser
npm run build        # Next.js production build (all routes statically prerendered)
npm run test:e2e     # Playwright: navigation, filters, exports, add company, upload, explore invite (demo + sandbox), approval, Ask, and the full 8-step demo
npm run verify       # typecheck + lint + unit tests + build
```

`test:e2e` starts `next start` on port 3100 against the production build, so run `npm run build` first. If Playwright cannot find a browser, run `npx playwright install chromium` (or set `PLAYWRIGHT_BROWSERS_PATH` to an existing install).

### Inspect the dataset

```bash
npm run data:export  # writes ./data/*.csv, dataset.json and validation.json
```

---

## Deploy

**Vercel (recommended).** The app is a standard Next.js 15 App Router project with no environment variables.

```bash
npm i -g vercel
vercel           # preview deployment
vercel --prod    # production
```

Or import the repository in the Vercel dashboard — framework preset *Next.js*, default build (`next build`) and output settings.

**Any Node host** (Render, Railway, Fly.io, a VM, Docker): run `npm ci && npm run build && npm start` and expose port 3000 (`PORT` can be overridden with `next start -p $PORT`).

---

## What is synthetic and what is simulated

**Synthetic data** (generated by `src/lib/data/generate.ts`, deterministic seed):
- 1 firm, 2 funds, 12 companies, 33 months (Jan 2024 – Sep 2026) of P&L, cash flow, balance-sheet memo lines, budgets, operating KPIs, entity-level ledgers for 15 legal entities at the 4 DualEntry-connected companies, 5 M&A transactions (4 closed, 1 pending) and GBP/USD FX rates.
- Deliberate stories derived from parameters, never hard-coded insights: Meridian (labor outpacing revenue, margin pressure, add-on), Atlas (multi-entity SaaS), Beacon (accelerating growth and operating leverage), Horizon (slow growth, rising personnel cost, GBP reporting), Cedar (stable efficient), Summit (high margin, weak cash conversion, cost reclassification), Crestpoint (persistent budget misses), Northstar (recent acquisition with entity-level organic split), Harbor (tuck-in without organic data), Lattice (growth-stage SaaS), Apex (missing Q3 submission, stale), BluePeak (partial quarter, no labor split, no budget).

**Prototype simulations** (functional UI, no external effects):
- DualEntry data-share approvals and the CFO's invite page (`/approve/…`, `/invite/…`) are simulated DualEntry pages, clearly labelled. The sandbox is represented by a confirmation only. The reps (Sarah Chen, Daniel Okafor) are fictional.
- *Send DualEntry invite* records the invite but no email actually leaves the app; use *Open the CFO's view* to play the CFO. Later stages (demo held, evaluating, migrating, on DualEntry) are set with a labelled demo control — in production they would arrive from DualEntry.
- Uploads are parsed and validated in the browser.
- "Ask Your Portfolio" uses a local, rule-based interpreter — no LLM or API call. All figures come from the analytics engine.

---

## Known limitations

- **Brand.** dualentry.com was not reachable from the build environment (network policy), so the visual identity is a professional approximation. All colors live as CSS variables in `src/app/globals.css`; the wordmark is text only (no official logo asset was used). Drop approved assets into `public/brand` and adjust the tokens to align with brand guidelines.
- **Ask Your Portfolio** understands a defined set of intents (growth, margins, totals, rankings, company and cohort comparisons, labor vs revenue, budget variance, cash flow, margin changes, trends, out/under-performance, company summaries, reporting status) plus common follow-ups. Out-of-scope questions (IRR, valuation, forecasts) are declined rather than guessed. An LLM could be layered on top later for phrasing, but the engine must remain the source of every number.
- **Periods.** Portfolio views are calendar quarters (calendarised from monthly data, which is exact). FY 2026 is not selectable because it is incomplete; YTD 2026 is.
- **Currency.** One non-USD company (GBP) with synthetic FX; budgets are translated at actual average rates (variance excludes FX). Constant-currency growth is not shown.
- **Organic growth** is only computed where entity-level ledgers exist (DualEntry-connected companies); for uploaded data it is reported as unavailable, by design.
- **Persistence.** Filters, period and Ask history persist per browser tab (`sessionStorage`); the watchlist persists in `localStorage`. Added companies, uploads, data-share approvals and migration stages are saved **in this browser only** (`localStorage`) — nobody else sees them, and there are no accounts or server storage. User menu → **Reset demo data** removes them.
- **Added companies** are USD only, have no budget upload (budget vs actual is unavailable for them), and their history is synthesized from a template company of the same business model once data "arrives". Uploads cover monthly P&L, cash flow and headcount at consolidated level only.
- **Responsive.** Designed for 1440 px desktop and verified at 1280 px and 1024 px; wide tables scroll horizontally. The left sidebar hides below 1024 px.

See **[DEMO_SCRIPT.md](DEMO_SCRIPT.md)** for the live walkthrough and **[ARCHITECTURE.md](ARCHITECTURE.md)** for the design of the data model, engines and query layer.
