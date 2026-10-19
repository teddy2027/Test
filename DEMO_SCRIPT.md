# Live demo script — DualEntry | Portfolio Intelligence

**Scenario.** Northbridge Equity Partners (fictional) is reviewing **Q3 2026** results. The operating partner wants to understand overall performance, cost trends, and which companies need operational attention.

**Runtime:** ~12 minutes. **Setup:** `npm run build && npm start`, open `http://localhost:3000` at 1440 px wide in a fresh tab (filters persist per tab; *User menu → Reset demo state* or the filter-bar **Reset** clears them). Every number below is computed live by the engine; this whole sequence is also an automated test (`tests/e2e/demo.spec.ts`).

---

## Step 1 — Portfolio dashboard (≈2 min)

Open **Portfolio** (default: Q3 2026, vs same quarter last year). The menu has three items: Portfolio, Insights, Data Connections.

Point out:
- **Portfolio revenue $171.7M**, aggregate growth **+16.9%** vs average company growth **+17.2%** (toggle *Aggregate (Σ) / Avg company* — they are different metrics and are always labelled). "2 M&A-affected" is flagged on the growth card.
- **EBITDA $31.8M**, portfolio EBITDA margin **18.5% (−0.8 pp)**; average company margin 17.0%. Operating cash flow **$21.6M** (68% of EBITDA — cash flow is reported, never approximated by EBITDA).
- **Companies reporting 10 / 12**: Apex Workforce has not submitted Q3; BluePeak submitted 2 of 3 months. They are excluded from totals and like-for-like comparisons, and the coverage is shown on every card ("Like-for-like: 10 of 12").
- **Signals row**: *Needs attention* (Meridian, Summit, Crestpoint, Horizon, Cedar), *Outperforming* (Beacon, Lattice), *Incomplete or stale data* (Apex, BluePeak, Summit's reclassification).
- **Reconciliation**: the table's *Portfolio (Σ)* footer equals the KPI card ($171.7M). Hover any (i) for metric definitions; *Methodology* in the sidebar runs the live data-integrity checks.

- **Comparison chart** (right of the trend): set *Compare* to **Labor intensity** and *Group by* to **Business model** — subscription software median 49.0% (5 companies), recurring managed services 62.7% (Meridian highest at 73.1%), project-based services shown but marked *too small to benchmark* (2 companies). This is the cost benchmarking; any bar opens the company.

Optional: switch the comparison to **vs Budget** (portfolio EBITDA −5.1% vs budget, 10 of 12 with budgets).

## Step 2 — Filter by Business Services (≈1 min)

Filter bar → **Industry → Business Services**.

Everything updates together: 7 companies in the table, revenue **$86.9M**, aggregate growth **+11.6%** vs average **+9.7%**, EBITDA margin **15.4% (−3.1 pp)**, reporting **5 / 7**, and the trend chart states its fixed cohort ("Fixed cohort of 5 companies…").

## Step 3 — Insights (≈2 min)

Sidebar → **Insights**. The filter carries over.

- The **Labor cost growth vs revenue growth** spotlight compares the services businesses: **Meridian Services labor +22.2% vs revenue +11.3% (+10.9 pp)** — the only one above the 8 pp threshold (highlighted; points above the diagonal grew labor faster than revenue).
- Insight cards are grouped by Growth / Profitability / Cost Efficiency / Cash Flow / Reporting Quality. Read the Meridian card: *"Meridian Services labor costs grew 22.2% while revenue increased 11.3% (Q3 2026 vs Q3 2025). The 10.9-percentage-point gap merits investigation."*
- Click it. The drill-down shows the finding with supporting figures (headcount growth and cost per employee decomposition), **indexed KPI history**, **comparison with business-services peers** (median, n), **underlying components**, **possible explanations** (framed as hypotheses — not causes), and **data source/period context** (NetSuite upload, refreshed Oct 12).

## Step 4 — Inspect Meridian (≈1.5 min)

In the drawer → **Inspect company data**.

- Header: Fund II, invested Apr 2022, 82% owned, NetSuite, 4 entities, **Keystone Facility Partners** add-on (closed Jul 2025). Q3 2026 vs Q3 2025 is *constant-perimeter*; TTM comparisons are flagged as acquisition-affected.
- KPI strip: revenue $33.9M (+11.3%), EBITDA margin **11.4% (−6.8 pp)**, labor growth +22.2%, EBITDA **−30.4% vs budget**.
- Charts: *Labor cost vs revenue — indexed* (labor line pulling away in 2026), *EBITDA and gross margin*, *Labor intensity*.
- Income Statement tab: expand **Cost of revenue → Direct labor**; switch Monthly / Quarterly / Annual. *Entities & consolidation* tab is locked — entity data isn't available from an upload (sets up step 7).

## Step 5 — Compare with peers (≈1.5 min)

Header → **Compare with peers** (scrolls to the peers section on the same page; *Peers by* can switch to business model, revenue band, fund or vintage).

- Peer rule: Sector = Business Services, subject excluded, complete Q3 data only → **4 eligible peers** (Horizon, Summit, Crestpoint, Harbor); Apex and BluePeak shown as not eligible; **small-cohort warning** displayed.
- Relative performance: labor cost growth **22.2% vs 11.1% median**, labor intensity **73.1% vs 69.3% (+3.8 pp)**, EBITDA margin **11.4% vs 13.1%** after a **−6.8 pp** change vs a −1.2 pp peer median, revenue growth **11.3% vs 8.5%** (Meridian is growing faster — the issue is cost, not demand).
- Point out that absolute amounts are tagged "scale" — normalized ratios lead the comparison.

## Step 6 — Ask Your Portfolio (≈1.5 min)

Insights → **Ask Your Portfolio**, type:

> **Which services companies have labor costs growing faster than revenue, and by how much?**

Expected direct answer: *"3 of 5 services companies grew labor costs faster than revenue in Q3 2026 (vs same quarter last year): Meridian Services by 10.9 pp (labor +22.2% vs revenue +11.3%); Horizon Advisory by 5.5 pp …; Crestpoint Consulting by 3.2 pp …. Meridian Services exceeds the 8 pp attention threshold."*

Show: the "Interpreted as" chips (intent, sector, period), the chart and table, *Why it matters*, *Explore further* links (click **Meridian Services** to jump to the company), and *Methodology* (labor definition, periods, exclusions: Apex no data, BluePeak no labor split).

Follow-up: **"What about software companies?"** (re-runs the same analysis for software). Show a refusal: **"What is our IRR?"** — declined, with supported alternatives.

Other questions that work:
- What was portfolio revenue growth in Q3 2026?
- Which companies missed EBITDA budget?
- Compare Meridian Services with other services businesses
- Which businesses have deteriorating gross margins?
- Which software companies are growing fastest?
- What is our average EBITDA margin?
- Which companies experienced declining operating cash flow?
- How has G&A as a percentage of revenue changed?
- Which companies are outperforming their peers? / …underperforming their peers?
- Which companies have weak cash conversion? → *and for Fund II?*
- Compare Atlas and Beacon · Show me Northstar · What was total EBITDA last quarter? · Which companies haven't submitted Q3 data?

## Step 7 — The DualEntry advantage (≈2 min)

Sidebar → **Data Connections**.

- **Upload vs DualEntry**: what each route delivers — arrival (~15 vs ~5 business days), Northbridge effort, and depth. Live example: Northstar acquired Vantage in May 2026, reported growth +23.2% but **organic growth +8.1%** from entity ledgers; for an uploaded company organic growth is *not determinable*. Entity P&L with eliminations, working-capital bridge and account drill-down come only with DualEntry.
- Optional: open Northstar → *Entities & consolidation* (4 entities, eliminations, Vantage flagged as acquired) and *Cash Flow* (interest, tax and working-capital lines).
- The **Manual reporting effort** panel make the cost of the upload path visible: ~1.5 hours per monthly pack, re-uploads counted, days after month-end. The upload path is competent — template, example file, validation, preview, version history — but a file can only deliver what a file can deliver: no daily data, no entity books, no account drill-down, no organic split, never zero effort.
- **Migration pipeline**: where each upload company stands (Harbor has a demo booked and opened the sandbox, Cedar is evaluating, Horizon opened the sandbox but has not booked, Summit has not responded in 19 days and shows as *Stalled*).
- In the inventory, click Meridian's *Explore DualEntry* status (**Not started**). The panel shows why it's worth it for Meridian, built only from data Northbridge already has (none of it goes into the invite).
- **Send DualEntry invite** → the email goes from Portfolio Intelligence in Alex Morgan's name to the CFO, CC the routed DualEntry rep (Daniel Okafor — 4 entities, ~$130M revenue → enterprise team). Edit the note; the link is added automatically: **Book a demo** and **Open a sandbox**, one link unique to Meridian. Press **Send invite**.
- **Open the CFO's view** (simulated DualEntry page): name and email pre-filled. **Open my sandbox** (sample data only), then pick a demo slot → **Confirm demo**. Back in Portfolio Intelligence the panel shows *Demo booked* and *Sandbox opened* on its own. Later stages (demo held, evaluating, migrating, on DualEntry) would arrive from DualEntry; a demo control simulates them. Northbridge sees milestones only, never the content of DualEntry's conversations or sandbox activity.
- Optional: **Add company** (on Portfolio, above the table). *On DualEntry* → a data-share request the company approves inside DualEntry (open the simulated approval page: level of detail, entities, statements, closed months only, hidden accounts, audience, preview as Northbridge, second approver for entity-level books). *Not on DualEntry* → the company appears as *Awaiting data* until Northbridge uploads its first pack.

## Step 8 — Close (≈30 s)

Sidebar → **Portfolio**. The Business Services filter is still applied and the figures match step 2 ($86.9M). Press **Reset** — back to $171.7M across 12 companies. Close on the three layers: *visibility* (one financial view), *intelligence* (cross-portfolio insights and benchmarks), *accounting-native advantage* (deeper, faster data where companies run on DualEntry).

---

### Recovery tips

- Unexpected numbers → check the filter bar (active filters are highlighted in blue) and press **Reset**.
- The drawer or a dialog won't close → press **Esc**.
- A page looks empty → the active filter may exclude all companies; the page says so explicitly.
