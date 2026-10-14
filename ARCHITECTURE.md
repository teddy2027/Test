# Architecture — DualEntry | Portfolio Intelligence

A client-rendered Next.js 15 (App Router) application. All pages are statically prerendered; data is generated deterministically in the browser bundle, so the prototype needs no backend. The structure mirrors how the product would be split in production: **data → analytics engine → insight / query layers → UI**. The UI never calculates a metric itself.

```
src/
  lib/
    data/        schema (Zod), seed assumptions, deterministic generator, FX translation, indexes, validation
    engine/      periods, metric registry, company analysis, portfolio aggregation, filters, benchmarks, insights, series
    query/       question parser (intents) + answer engine
    state/       zustand store (filters, period, comparison, watchlist, chat) and scope hooks
    format.ts    single number-formatting module (N/A, $M/$K, %, pp)
    export.ts    CSV builder with synthetic-data provenance header
  components/    shell, ui primitives, fin display atoms, charts, and one folder per page
  app/           routes: / · /insights · /compare · /companies · /companies/[id] · /connections · /reporting
tests/unit       Vitest (calculations, aggregation, data integrity, insights, query)
tests/e2e        Playwright (navigation, filters, exports, wizard, Ask, eight-step demo)
```

## Data model (`src/lib/data`)

Normalized tables, each validated by a Zod schema (`types.ts`):

| Table | Grain | Notes |
|---|---|---|
| `funds` | fund | Fund II (2020), Fund III (2023) |
| `companies` | company | fund, sector, subsector, business model, investment date → vintage, ownership, base currency, fiscal year end, accounting system, connection type, entity count, data source, freshness, data quality, missing fields, definition notes |
| `monthlyLocal` / `monthly` | company × month | functional-currency and USD-translated P&L, cash flow and balance memo lines |
| `budgetsLocal` / `budgets` | company × month | revenue, COGS, opex, EBITDA, CFO (nullable) |
| `operational` | company × month | headcount, billable headcount, utilization, ARR (subscription only), customers, NRR |
| `entities`, `entityMonthly` | entity × month | DualEntry-connected companies only: external revenue, intercompany revenue/cost, EBITDA |
| `transactions` | deal | platform, target, type, announced/closed, integration status, perimeter impact, linked entity |
| `fx` | currency × month | average (flows) and closing (balances) rates |

**Accounting convention** (enforced by `validate.ts` on every load in tests and shown live in *Methodology*):

- Revenue = subscription + services; COGS = direct labor + other COGS; Gross profit = Revenue − COGS.
- Opex = S&M + R&D + G&A + other; EBITDA = Gross profit − Opex.
- Operating personnel = personnel portion of S&M/R&D/G&A (memo). Labor = direct labor + operating personnel — mutually exclusive, never double counted.
- CFO = EBITDA − cash interest − cash taxes − ΔNWC; Cash end = Cash begin + CFO − capex − acquisitions + financing (checked in local currency).
- Entity ledgers reconcile to consolidated revenue and EBITDA; intercompany nets to zero.

**Generator.** `seed.ts` holds per-company *assumptions* (growth paths, cost-ratio paths, DSO, leverage, acquisitions, budget growth, reclassifications, reporting gaps). `generate.ts` builds an operating stream per platform and per acquired business, consolidates them, derives debt service, taxes, working capital, cash and KPIs, applies connection-dependent field visibility (uploads don't include the cash bridge; one company has no labor split) and translates GBP to USD. A seeded PRNG makes the output identical on every load. Stories such as "Meridian labor outpacing revenue" are emergent from those paths — the insight engine discovers them.

## Analytics engine (`src/lib/engine`)

- **`periods.ts`** — quarter, YTD, TTM and FY periods as month ranges; prior-period and same-period-last-year comparisons with identical length; null when the comparison precedes the data.
- **`metrics.ts`** — registry of every metric: label, format, favorable direction, definition (drives tooltips and colouring).
- **`company.ts`** — `analyzeCompany(id, period)` → current values and ratios, prior and YoY comparison blocks (growth, pp changes, operating leverage), budget block (variance = actual − budget, % on |budget|). A period is *complete* only if every month exists; partial periods are never annualized. Growth is null on a zero/negative base. Acquisitions closing after the comparison start and on/before the current end flag the comparison; **organic growth** is computed only when entity ledgers allow a constant perimeter. Budgets exclude acquisitions closed in the budget year.
- **`portfolio.ts`** — two explicitly separate families: *aggregate* (Σ numerator ÷ Σ denominator over a like-for-like cohort) and *average company* (mean of company ratios). Coverage objects list every excluded company and why. Trend series use a fixed cohort so reporting gaps don't distort lines. Sums are management-view aggregates, not GAAP consolidation.
- **`filters.ts`** — fund, sector, business model, vintage, geography, investment-date range.
- **`benchmark.ts`** — peer cohorts by sector / business model / fund / vintage / revenue band / portfolio within the filtered universe; subject excluded; median default; warnings for n < 3 (not meaningful), n < 5 (caution), mixed sectors, wide scale range.
- **`insights.ts`** — deterministic rules with configurable `THRESHOLDS` (labor gap > 8 pp, margin contraction > 3 pp, revenue miss > 10%, EBITDA miss > 15%, TTM cash conversion < 50%, peer gap > 8 pp, reclassification signature, unusual QoQ change, missing/partial/stale data, definition differences, positive outliers). Each insight carries company, category, period, computed finding, supporting figures, severity, hypotheses, caveats and chart metrics. Ordering: severity → editorial rule priority → magnitude.
- **`series.ts`, `compareMetrics.ts`** — quarterly/monthly/annual series and the normalized comparison metric set used by the comparison and benchmarking views.

## Query interpretation (`src/lib/query`)

`parser.ts` normalizes the question and extracts companies (aliases, ordered), metric, sector, business model, fund, period (Q3 2026, TTM, YTD, FY 2025, "last quarter"), comparison basis, direction and polarity; then classifies one of 15 approved intents (`portfolio_growth`, `portfolio_margin`, `portfolio_total`, `rank_companies`, `compare_companies`, `compare_to_cohort`, `labor_growth_outliers`, `budget_variance`, `cash_flow_outliers`, `margin_changes`, `trend_summary`, `outperformers`, `company_summary`, `reporting_status`, `unsupported`). Short follow-ups ("what about software companies?", "and for Fund II?") inherit the previous query and override scope. Known out-of-scope topics (IRR, valuation, forecasts) are declined with a reason.

`answer.ts` executes the intent against the engine and returns a structured answer — direct answer, KPI tiles, chart spec, table rows (clickable companies), why it matters, explore links, methodology (cohort, periods, exclusions) and follow-ups. Global filters always apply. **No number is produced by the parser or by any language model.** An LLM could later be added to paraphrase questions into the same structured query, keeping the engine as the only source of figures.

## Design system

- Tokens as CSS variables (`src/app/globals.css`) mapped into Tailwind (`tailwind.config.ts`): ink-navy neutrals, a blue accent, status colours (positive/negative/warning/info) reserved for meaning and always paired with an arrow/icon/sign.
- Inter (self-hosted via @fontsource) with tabular numerals for all figures.
- Radix-based primitives (tooltip, popover, dialog/sheet, tabs, dropdown) in `components/ui/primitives.tsx`; TanStack Table for the portfolio table; Recharts for charts (validated categorical order: blue, orange, aqua; single-series charts use emphasis — highlight one, grey the rest; one y-axis only; indexed series for comparing amounts of different scale).
- One formatter (`format.ts`) for $M/$K, %, pp and N/A everywhere, including exports.

## State

`zustand` store: filters, period selection, comparison basis, aggregation mode and Ask history persist in `sessionStorage` (per tab, survive reloads); the watchlist persists in `localStorage`. URL parameters drive deep links (`/insights?tab=ask&q=…`, `?insight=…`, `/compare?subject=…`, `?ids=a,b`).

## Future integration points

1. **DualEntry ledger API** → replace `generate.ts` with a connector that writes the same normalized tables (company × month × account → portfolio category), keeping entity and account granularity for drill-down.
2. **Upload ingestion** → the wizard's mapping and validation steps become a server-side pipeline (template parser, mapping memory per company, the same `validateDataset` checks) with submission history and audit trail.
3. **Permissions** → company-granted scopes (summary vs detailed vs entity/account level; sponsor roles) enforced server-side; a separate, consent-based record for any commercial evaluation request, never derived from financial data access.
4. **Warehouse** → move aggregation to SQL/columnar storage once portfolios exceed a few hundred companies; keep the engine's function signatures as the contract and the unit tests as the specification.
5. **Notifications** → threshold breaches and late submissions pushed to operating partners and finance leads.
6. **LLM layer** → natural-language paraphrase into `ParsedQuery`, narrative summaries for board packs — always citing engine outputs.
