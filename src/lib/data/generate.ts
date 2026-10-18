/**
 * Deterministic synthetic-data generator.
 *
 * Every number shown in the application originates here and is then only
 * aggregated / divided by the analytics engine — insights are never hard-coded.
 * Amounts are in millions of the record's currency.
 */
import { LAST_MONTH, monthIndexFromDate, monthOfYear, monthYear } from "./calendar";
import { makeNoise } from "./rng";
import { COMPANY_SEEDS, FIRM, FUNDS, type CompanySeed, type StreamParams } from "./seed";
import type {
  BudgetMonthly,
  Company,
  Dataset,
  Entity,
  EntityMonthly,
  FxRate,
  MonthlyFinancial,
  OperationalMonthly,
  Transaction,
} from "./types";

type Path = [number, number][];

export function interp(path: Path, m: number): number {
  if (m <= path[0][0]) return path[0][1];
  const last = path[path.length - 1];
  if (m >= last[0]) return last[1];
  for (let i = 1; i < path.length; i++) {
    const [m1, v1] = path[i];
    const [m0, v0] = path[i - 1];
    if (m <= m1) return v0 + ((v1 - v0) * (m - m0)) / (m1 - m0);
  }
  return last[1];
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

interface StreamMonth {
  m: number;
  revenue: number;
  subscriptionRevenue: number | null;
  servicesRevenue: number | null;
  mrr: number | null;
  trendRevenue: number;
  directLabor: number;
  otherCogs: number;
  sm: number;
  rd: number | null;
  ga: number;
  otherOpex: number;
  smP: number;
  rdP: number | null;
  gaP: number;
  ar: number;
  deferred: number;
  ap: number;
  capex: number;
  employees: number;
  billable: number;
}

/**
 * Builds one operating stream (a platform company or an acquired business) for
 * months [origin-1 … LAST]. Month origin-1 is only used for opening balances.
 */
function buildStream(p: StreamParams, origin: number, seed: string, reclass?: { fromMonth: number; pct: number }): Map<number, StreamMonth> {
  const noise = makeNoise(seed);
  const rate = (m: number) => Math.pow(1 + interp(p.growth, m), 1 / 12) - 1;
  // growth index relative to origin
  const idx = new Map<number, number>();
  idx.set(origin, 1);
  for (let m = origin + 1; m <= LAST_MONTH; m++) idx.set(m, idx.get(m - 1)! * (1 + rate(m)));
  for (let m = origin - 1; m >= origin - 14; m--) idx.set(m, idx.get(m + 1)! / (1 + rate(m + 1)));
  const trend = (m: number) => p.base * idx.get(m)!;

  const mrr = new Map<number, number>();
  if (p.subscription) for (let m = origin - 2; m <= LAST_MONTH; m++) mrr.set(m, trend(m) * (1 + noise(p.noise * 0.25)));

  const out = new Map<number, StreamMonth>();
  const revHist = new Map<number, number>();
  for (let m = origin - 3; m <= origin - 2; m++) revHist.set(m, trend(m) * (p.subscription ? 1 + (p.servicesRatio ?? 0) : 1));
  for (let m = origin - 1; m <= LAST_MONTH; m++) {
    const season = p.seasonality[monthOfYear(m)];
    let revenue: number;
    let sub: number | null = null;
    let svc: number | null = null;
    let trendRevenue: number;
    if (p.subscription) {
      sub = r6((mrr.get(m - 1)! + mrr.get(m)!) / 2);
      svc = r6(sub * (p.servicesRatio ?? 0) * season * (1 + noise(p.noise * 2)));
      revenue = r6(sub + svc);
      trendRevenue = trend(m) * (1 + (p.servicesRatio ?? 0));
    } else {
      revenue = r6(trend(m) * season * (1 + noise(p.noise)));
      svc = revenue;
      trendRevenue = trend(m);
    }
    const directLabor = r6(trendRevenue * interp(p.directLaborPct, m) * (1 + noise(p.noise * 0.5)));
    let otherCogs = revenue * interp(p.otherCogsPct, m) * (1 + noise(p.noise * 0.6));
    const sm = r6(trendRevenue * interp(p.smPct, m) * (1 + noise(p.noise)));
    const rd = p.rdPct ? r6(trendRevenue * interp(p.rdPct, m) * (1 + noise(p.noise))) : null;
    const gaBase = trendRevenue * interp(p.gaPct, m) * (1 + noise(p.noise));
    let ga = gaBase;
    if (reclass && m >= reclass.fromMonth) {
      const moved = trendRevenue * reclass.pct;
      ga -= moved;
      otherCogs += moved;
    }
    otherCogs = r6(otherCogs);
    ga = r6(ga);
    const otherOpex = r6(trendRevenue * interp(p.otherOpexPct, m) * (1 + noise(p.noise)));
    const smP = r6(sm * p.personnel.sm);
    const rdP = rd === null ? null : r6(rd * p.personnel.rd);
    const gaP = r6(gaBase * p.personnel.ga);
    const nonPersonnel = otherCogs + (sm - smP) + ((rd ?? 0) - (rdP ?? 0)) + (ga - gaP) + otherOpex;
    revHist.set(m, revenue);
    const comp = p.compPerHead * Math.pow(1 + p.wageInflation, m / 12);
    const labor = directLabor + smP + (rdP ?? 0) + gaP;
    out.set(m, {
      m,
      revenue,
      subscriptionRevenue: sub,
      servicesRevenue: p.subscription ? svc : revenue,
      mrr: p.subscription ? mrr.get(m)! : null,
      trendRevenue,
      directLabor,
      otherCogs,
      sm,
      rd,
      ga,
      otherOpex,
      smP,
      rdP,
      gaP,
      // DSO measured on trailing-three-month revenue (standard count-back convention, smooths seasonality).
      ar: ((revenue + revHist.get(m - 1)! + revHist.get(m - 2)!) / 90) * interp(p.dso, m),
      deferred: p.subscription ? mrr.get(m)! * p.deferredMonths : 0,
      ap: nonPersonnel * (p.dpo / 30),
      capex: r6(revenue * p.capexPct * (1 + noise(0.08))),
      employees: Math.round((labor * 12) / comp),
      billable: Math.round((directLabor * 12) / comp),
    });
  }
  return out;
}

function cleanRevenue(p: StreamParams, origin: number, m: number): number {
  // Noise-free revenue path used by budget planners (prior-year run-rate × planned growth).
  const rate = (k: number) => Math.pow(1 + interp(p.growth, k), 1 / 12) - 1;
  let idx = 1;
  if (m >= origin) for (let k = origin + 1; k <= m; k++) idx *= 1 + rate(k);
  else for (let k = origin; k > m; k--) idx /= 1 + rate(k);
  const season = p.seasonality[monthOfYear(m)];
  return p.base * idx * (p.subscription ? 1 + (p.servicesRatio ?? 0) * season : season);
}

export function buildFx(): FxRate[] {
  const noise = makeNoise("fx-gbp");
  const path: Path = [[0, 1.268], [6, 1.272], [10, 1.255], [14, 1.262], [18, 1.318], [24, 1.342], [28, 1.351], [32, 1.336]];
  const out: FxRate[] = [];
  for (let m = 0; m <= LAST_MONTH; m++) {
    const avg = interp(path, m) + noise(0.006);
    out.push({ currency: "GBP", month: m, average: Math.round(avg * 10000) / 10000, closing: Math.round((avg + noise(0.005)) * 10000) / 10000 });
    out.push({ currency: "USD", month: m, average: 1, closing: 1 });
  }
  return out;
}

export interface Built {
  company: Company;
  entities: Entity[];
  monthlyLocal: MonthlyFinancial[];
  budgetsLocal: BudgetMonthly[];
  operational: OperationalMonthly[];
  entityMonthly: EntityMonthly[];
  transactions: Transaction[];
}

export function buildCompany(seed: CompanySeed, gbp: Map<number, FxRate>): Built {
  const id = seed.master.id;
  const reportedThrough = seed.reportedThrough ?? LAST_MONTH;
  const company: Company = {
    ...seed.master,
    vintage: Number(seed.master.investmentDate.slice(0, 4)),
    lastReportedMonth: reportedThrough,
  };
  const platform = buildStream(seed.stream, 0, `${id}:platform`, seed.reclass);
  const acqs = seed.acquisitions.map((a) => {
    const closeMonth = a.closed ? monthIndexFromDate(a.closed) : null;
    const stream = a.stream && closeMonth !== null ? buildStream(a.stream, closeMonth, `${id}:${a.id}`) : null;
    return { seed: a, closeMonth, stream };
  });

  const fxAvg = (m: number) => (company.baseCurrency === "GBP" ? gbp.get(m)!.average : 1);

  const monthlyLocal: MonthlyFinancial[] = [];
  const operational: OperationalMonthly[] = [];
  const entityMonthly: EntityMonthly[] = [];
  const entities: Entity[] = [];

  let debt = seed.debt0;
  let cash = seed.cash0;
  const ebitdaHist: number[] = [];
  const interestHist: number[] = [];
  const capexHist: number[] = [];

  // Entity registry (DualEntry-connected companies expose entity-level ledgers).
  if (seed.entities) {
    seed.entities.forEach((e, i) =>
      entities.push({ id: `${id}-e${i + 1}`, companyId: id, name: e.name, country: e.country, currency: e.currency, role: e.role, sinceMonth: 0, transactionId: null }),
    );
    acqs.forEach((a, i) => {
      if (a.closeMonth !== null)
        entities.push({
          id: `${id}-a${i + 1}`,
          companyId: id,
          name: a.seed.entityName,
          country: a.seed.entityCountry,
          currency: a.seed.entityCountry === "United Kingdom" ? "GBP" : "USD",
          role: "Acquired",
          sinceMonth: a.closeMonth,
          transactionId: a.seed.id,
        });
    });
  }
  const entityNoise = makeNoise(`${id}:entities`);

  const nrrNoise = makeNoise(`${id}:kpi`);

  for (let m = 0; m <= LAST_MONTH; m++) {
    const parts: StreamMonth[] = [platform.get(m)!];
    const prevParts: StreamMonth[] = [platform.get(m - 1)!];
    let acquisitionsOut = 0;
    let draw = 0;
    for (const a of acqs) {
      if (a.stream && a.closeMonth !== null && m >= a.closeMonth) {
        parts.push(a.stream.get(m)!);
        prevParts.push(a.stream.get(m - 1)!);
        if (m === a.closeMonth) {
          acquisitionsOut += a.seed.purchasePrice;
          draw += a.seed.purchasePrice * a.seed.debtFundedPct;
        }
      }
    }
    const sum = (f: (s: StreamMonth) => number | null) => r6(parts.reduce((acc, s) => acc + (f(s) ?? 0), 0));
    const anyNonNull = (f: (s: StreamMonth) => number | null) => parts.some((s) => f(s) !== null);

    const subscriptionRevenue = anyNonNull((s) => s.subscriptionRevenue) ? sum((s) => s.subscriptionRevenue) : null;
    const servicesRevenue = sum((s) => s.servicesRevenue);
    const revenue = r6((subscriptionRevenue ?? 0) + servicesRevenue);
    const directLabor = sum((s) => s.directLabor);
    const otherCogs = sum((s) => s.otherCogs);
    const cogs = r6(directLabor + otherCogs);
    const grossProfit = r6(revenue - cogs);
    const sm = sum((s) => s.sm);
    const rd = anyNonNull((s) => s.rd) ? sum((s) => s.rd) : null;
    const ga = sum((s) => s.ga);
    const otherOpex = sum((s) => s.otherOpex);
    const opex = r6(sm + (rd ?? 0) + ga + otherOpex);
    const smP = sum((s) => s.smP);
    const rdP = rd === null ? null : sum((s) => s.rdP);
    const gaP = sum((s) => s.gaP);
    const opPersonnel = r6(smP + (rdP ?? 0) + gaP);
    const ebitda = r6(grossProfit - opex);

    // Working capital: change in operating balances of streams in the perimeter (acquired opening balances are investing, not CFO).
    const nwc = (s: StreamMonth) => s.ar - s.deferred - s.ap;
    const changeInNwc = r6(parts.reduce((acc, s, i) => acc + nwc(s) - nwc(prevParts[i]), 0));
    const capex = sum((s) => s.capex);
    const interest = r6((debt * seed.interestRate) / 12);
    let taxes = 0;
    ebitdaHist.push(ebitda);
    interestHist.push(interest);
    capexHist.push(capex);
    if (monthOfYear(m) % 3 === 2) {
      const n = ebitdaHist.length;
      let base = 0;
      for (let k = Math.max(0, n - 3); k < n; k++) base += ebitdaHist[k] - interestHist[k] - capexHist[k];
      taxes = r6(Math.max(0, base) * 0.24);
    }
    const cfo = r6(ebitda - interest - taxes - changeInNwc);
    const amort = Math.min(seed.amortization, debt);
    const financing = r6(draw - amort);
    const cashBegin = r6(cash);
    const cashEnd = r6(cashBegin + cfo - capex - acquisitionsOut + financing);
    cash = cashEnd;
    debt = r6(debt - amort + draw);

    monthlyLocal.push({
      companyId: id,
      month: m,
      currency: company.baseCurrency,
      revenue,
      subscriptionRevenue,
      servicesRevenue,
      directLabor,
      otherCogs,
      cogs,
      grossProfit,
      salesMarketing: sm,
      researchDevelopment: rd,
      generalAdmin: ga,
      otherOpex,
      operatingExpenses: opex,
      smPersonnel: smP,
      rdPersonnel: rdP,
      gaPersonnel: gaP,
      operatingPersonnel: opPersonnel,
      ebitda,
      cashInterest: interest,
      cashTaxes: taxes,
      changeInNwc,
      cashFromOperations: cfo,
      capex,
      acquisitions: r6(acquisitionsOut),
      financingFlows: financing,
      cashBegin,
      cashEnd,
      accountsReceivable: r6(parts.reduce((a, s) => a + s.ar, 0)),
      deferredRevenue: r6(parts.reduce((a, s) => a + s.deferred, 0)),
      accountsPayable: r6(parts.reduce((a, s) => a + s.ap, 0)),
      debt,
    });

    // Operating KPIs
    const mrrTotal = parts.reduce((a, s) => a + (s.mrr ?? 0), 0);
    const arr = company.hasArr ? r6(mrrTotal * 12 * fxAvg(m)) : null;
    const acv = seed.stream.acv ? seed.stream.acv * Math.pow(1.03, m / 12) : null;
    const quarterEnd = m - (monthOfYear(m) % 3) + 2;
    operational.push({
      companyId: id,
      month: m,
      employees: parts.reduce((a, s) => a + s.employees, 0),
      billableHeadcount: seed.utilization ? parts.reduce((a, s) => a + s.billable, 0) : null,
      utilization: seed.utilization ? Math.round((interp(seed.utilization, m) + nrrNoise(0.006)) * 1000) / 1000 : null,
      arr,
      customers: arr !== null && acv ? Math.round(arr / acv) : null,
      netRevenueRetention: seed.nrr ? Math.round(interp(seed.nrr, Math.min(quarterEnd, LAST_MONTH)) * 1000) / 1000 : null,
    });

    // Entity-level ledgers
    if (seed.entities) {
      const plat = platform.get(m)!;
      const platEbitda =
        plat.revenue - plat.directLabor - plat.otherCogs - plat.sm - (plat.rd ?? 0) - plat.ga - plat.otherOpex;
      const operating = seed.entities.filter((e) => e.role === "Operating");
      const rawShares = operating.map((e) => e.share * (1 + entityNoise(0.01)));
      const shareSum = rawShares.reduce((a, b) => a + b, 0);
      const shares = rawShares.map((s) => s / shareSum);
      const icTotal = seed.entities.reduce((a, e) => a + plat.revenue * e.icRevenuePct, 0);
      const nonOpEbitda = seed.entities
        .filter((e) => e.role !== "Operating")
        .reduce((a, e) => a + plat.revenue * e.icRevenuePct * (e.role === "IP holding" ? 0.95 : 0.074), 0);
      let opIdx = 0;
      let revAssigned = 0;
      seed.entities.forEach((e, i) => {
        const entityId = `${id}-e${i + 1}`;
        if (e.role === "Operating") {
          const isLast = opIdx === operating.length - 1;
          const rev = isLast ? r6(plat.revenue - revAssigned) : r6(plat.revenue * shares[opIdx]);
          revAssigned += rev;
          entityMonthly.push({
            companyId: id,
            entityId,
            month: m,
            externalRevenue: rev,
            intercompanyRevenue: 0,
            intercompanyCost: r6(icTotal * shares[opIdx]),
            ebitda: r6((platEbitda - nonOpEbitda) * shares[opIdx]),
          });
          opIdx++;
        } else {
          const icRev = plat.revenue * e.icRevenuePct;
          entityMonthly.push({
            companyId: id,
            entityId,
            month: m,
            externalRevenue: 0,
            intercompanyRevenue: r6(icRev),
            intercompanyCost: 0,
            ebitda: r6(icRev * (e.role === "IP holding" ? 0.95 : 0.074)),
          });
        }
      });
      acqs.forEach((a, i) => {
        if (a.stream && a.closeMonth !== null && m >= a.closeMonth) {
          const s = a.stream.get(m)!;
          entityMonthly.push({
            companyId: id,
            entityId: `${id}-a${i + 1}`,
            month: m,
            externalRevenue: s.revenue,
            intercompanyRevenue: 0,
            intercompanyCost: 0,
            ebitda: r6(s.revenue - s.directLabor - s.otherCogs - s.sm - (s.rd ?? 0) - s.ga - s.otherOpex),
          });
        }
      });
    }
  }

  // Budgets: approved at the start of each calendar year from the prior-year run-rate × planned growth.
  // Acquisitions are included in the budget only from the year after they close.
  const budgetsLocal: BudgetMonthly[] = [];
  if (seed.hasBudget) {
    for (let m = 0; m <= LAST_MONTH; m++) {
      const y = monthYear(m);
      const yearStart = (y - 2024) * 12;
      const g = seed.budgetGrowth[y];
      let rev = cleanRevenue(seed.stream, 0, m - 12) * (1 + g);
      const planRatio = (p: Path | null) => (p ? interp(p, yearStart - 1) : 0);
      const s = seed.stream;
      let cogsPct = planRatio(s.directLaborPct) + planRatio(s.otherCogsPct) + seed.budgetCostShift / 2;
      let opexPct = planRatio(s.smPct) + planRatio(s.rdPct) + planRatio(s.gaPct) + planRatio(s.otherOpexPct) + seed.budgetCostShift / 2;
      let cogs = rev * cogsPct;
      let opex = rev * opexPct;
      for (const a of acqs) {
        if (a.stream && a.closeMonth !== null && monthYear(a.closeMonth) < y) {
          const as = a.seed.stream!;
          const ar = cleanRevenue(as, a.closeMonth, m) * 1.01;
          cogsPct = planRatio(as.directLaborPct) + planRatio(as.otherCogsPct);
          opexPct = planRatio(as.smPct) + planRatio(as.rdPct) + planRatio(as.gaPct) + planRatio(as.otherOpexPct);
          rev += ar;
          cogs += ar * cogsPct;
          opex += ar * opexPct;
        }
      }
      const ebitda = rev - cogs - opex;
      budgetsLocal.push({
        companyId: id,
        month: m,
        currency: company.baseCurrency,
        revenue: r6(rev),
        cogs: r6(cogs),
        operatingExpenses: r6(opex),
        ebitda: r6(r6(rev) - r6(cogs) - r6(opex)),
        cashFromOperations: seed.budgetCashFlowProvided ? r6(ebitda * seed.budgetCashConversion) : null,
      });
    }
  }

  const transactions: Transaction[] = acqs.map((a, i) => ({
    id: a.seed.id,
    platformId: id,
    target: a.seed.target,
    type: a.seed.type,
    announced: a.seed.announced,
    closed: a.seed.closed,
    closeMonth: a.closeMonth,
    integrationStatus: a.seed.integrationStatus,
    annualizedRevenueUsdM:
      a.stream && a.closeMonth !== null
        ? Math.round(a.stream.get(a.closeMonth)!.revenue * 12 * fxAvg(a.closeMonth) * 10) / 10
        : Math.round(a.seed.purchasePrice * 0.9 * 10) / 10,
    perimeterImpact: a.seed.perimeterImpact,
    entityId: seed.entities && a.closeMonth !== null ? `${id}-a${i + 1}` : null,
  }));

  return {
    company,
    entities,
    monthlyLocal: applyVisibility(seed, monthlyLocal).filter((r) => r.month <= reportedThrough),
    budgetsLocal,
    operational: operational.filter((r) => r.month <= reportedThrough),
    entityMonthly: company.connection === "dualentry" ? entityMonthly : [],
    transactions,
  };
}

/** Fields a company does not submit are nulled — the depth of data depends on the connection type. */
function applyVisibility(seed: CompanySeed, rows: MonthlyFinancial[]): MonthlyFinancial[] {
  const connected = seed.master.connection === "dualentry";
  return rows.map((r) => {
    const out = { ...r };
    if (!connected) {
      out.cashInterest = null;
      out.cashTaxes = null;
      out.changeInNwc = null;
      out.accountsReceivable = null;
      out.deferredRevenue = null;
      out.accountsPayable = null;
      out.debt = null;
    }
    if (!seed.laborSplitProvided) {
      out.directLabor = null;
      out.otherCogs = null;
      out.smPersonnel = null;
      out.rdPersonnel = null;
      out.gaPersonnel = null;
      out.operatingPersonnel = null;
    }
    return out;
  });
}

const FLOW_FIELDS = [
  "revenue", "subscriptionRevenue", "servicesRevenue", "directLabor", "otherCogs", "cogs", "grossProfit", "salesMarketing",
  "researchDevelopment", "generalAdmin", "otherOpex", "operatingExpenses", "smPersonnel", "rdPersonnel", "gaPersonnel",
  "operatingPersonnel", "ebitda", "cashInterest", "cashTaxes", "changeInNwc", "cashFromOperations", "capex", "acquisitions", "financingFlows",
] as const;
const BALANCE_FIELDS = ["cashEnd", "accountsReceivable", "deferredRevenue", "accountsPayable", "debt"] as const;

/**
 * Translates local-currency records into USD: P&L and cash-flow lines at the
 * monthly average rate, balances at the month-end (closing) rate, and opening
 * cash at the prior month's closing rate. The difference is a translation
 * adjustment, so USD cash roll-forwards are only exact for USD companies.
 */
export function translateMonthly(rows: MonthlyFinancial[], fx: Map<string, FxRate>): MonthlyFinancial[] {
  return rows.map((r) => {
    if (r.currency === "USD") return r;
    const rate = fx.get(`${r.currency}:${r.month}`)!;
    const prev = fx.get(`${r.currency}:${r.month - 1}`) ?? rate;
    const out: MonthlyFinancial = { ...r, currency: "USD" };
    for (const f of FLOW_FIELDS) {
      const v = r[f];
      (out as Record<string, unknown>)[f] = v === null ? null : r6(v * rate.average);
    }
    for (const f of BALANCE_FIELDS) {
      const v = r[f];
      (out as Record<string, unknown>)[f] = v === null ? null : r6(v * rate.closing);
    }
    out.cashBegin = r.cashBegin === null ? null : r6(r.cashBegin * (r.month === 0 ? rate.average : prev.closing));
    // Keep the accounting identities exact after rounding.
    out.cogs = out.directLabor !== null && out.otherCogs !== null ? r6(out.directLabor + out.otherCogs) : r6(r.cogs * rate.average);
    out.revenue = r6((out.subscriptionRevenue ?? 0) + (out.servicesRevenue ?? 0));
    out.grossProfit = r6(out.revenue - out.cogs);
    out.operatingExpenses = r6(out.salesMarketing + (out.researchDevelopment ?? 0) + out.generalAdmin + out.otherOpex);
    if (out.operatingPersonnel !== null) out.operatingPersonnel = r6((out.smPersonnel ?? 0) + (out.rdPersonnel ?? 0) + (out.gaPersonnel ?? 0));
    out.ebitda = r6(out.grossProfit - out.operatingExpenses);
    return out;
  });
}

export function translateBudgets(rows: BudgetMonthly[], fx: Map<string, FxRate>): BudgetMonthly[] {
  return rows.map((b) => {
    if (b.currency === "USD") return b;
    const rate = fx.get(`${b.currency}:${b.month}`)!.average;
    const revenue = r6(b.revenue * rate);
    const cogs = r6(b.cogs * rate);
    const opex = r6(b.operatingExpenses * rate);
    return {
      ...b,
      currency: "USD",
      revenue,
      cogs,
      operatingExpenses: opex,
      ebitda: r6(revenue - cogs - opex),
      cashFromOperations: b.cashFromOperations === null ? null : r6(b.cashFromOperations * rate),
    };
  });
}

export function generateDataset(): Dataset {
  const fx = buildFx();
  const fxMap = new Map(fx.map((r) => [`${r.currency}:${r.month}`, r]));
  const gbp = new Map(fx.filter((r) => r.currency === "GBP").map((r) => [r.month, r]));
  const built = COMPANY_SEEDS.map((s) => buildCompany(s, gbp));
  const monthlyLocal = built.flatMap((b) => b.monthlyLocal);
  const budgetsLocal = built.flatMap((b) => b.budgetsLocal);
  return {
    firm: FIRM,
    funds: FUNDS,
    companies: built.map((b) => b.company),
    entities: built.flatMap((b) => b.entities),
    monthlyLocal,
    monthly: translateMonthly(monthlyLocal, fxMap),
    budgetsLocal,
    budgets: translateBudgets(budgetsLocal, fxMap),
    operational: built.flatMap((b) => b.operational),
    entityMonthly: built.flatMap((b) => b.entityMonthly),
    transactions: built.flatMap((b) => b.transactions),
    fx,
  };
}
