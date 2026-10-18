/**
 * FICTIONAL seed definitions for Northbridge Equity Partners.
 * Every firm, fund, company, person, system assignment and figure here is
 * invented for a concept demo. Accounting-system assignments are fictional
 * attributes and are NOT statements about any real company's software.
 */
import type { Company, Fund } from "./types";

export const FIRM = {
  name: "Northbridge Equity Partners",
  disclaimer:
    "Northbridge Equity Partners, its funds and all portfolio companies are fictional. All financial data is synthetic and generated for a concept demonstration.",
};

export const FUNDS: Fund[] = [
  {
    id: "fund-ii",
    name: "Northbridge Capital Partners II",
    shortName: "Fund II",
    vintage: 2020,
    committedCapitalUsdM: 1150,
    strategy: "Lower-middle-market software and business services buyouts",
  },
  {
    id: "fund-iii",
    name: "Northbridge Capital Partners III",
    shortName: "Fund III",
    vintage: 2023,
    committedCapitalUsdM: 1600,
    strategy: "B2B software and tech-enabled services platforms with buy-and-build theses",
  },
];

type Path = [number, number][];

export interface StreamParams {
  /** Starting monthly trend revenue (local currency, millions) — for subscription businesses this is MRR. */
  base: number;
  /** Annual growth anchors (month index → annual rate), linearly interpolated. */
  growth: Path;
  subscription: boolean;
  /** Services revenue as a ratio of subscription revenue (subscription businesses only). */
  servicesRatio?: number;
  seasonality: number[];
  directLaborPct: Path;
  otherCogsPct: Path;
  smPct: Path;
  rdPct: Path | null;
  gaPct: Path;
  otherOpexPct: Path;
  personnel: { sm: number; rd: number; ga: number };
  dso: Path;
  dpo: number;
  deferredMonths: number;
  capexPct: number;
  noise: number;
  /** Average fully loaded annual cost per employee (local, millions) at month 0, and annual wage inflation. */
  compPerHead: number;
  wageInflation: number;
  acv?: number; // average contract value (millions) for customer counts
}

export interface AcquisitionSeed {
  id: string;
  target: string;
  type: "Add-on acquisition" | "Tuck-in acquisition";
  announced: string;
  closed: string | null;
  integrationStatus: "Integrated" | "Integrating" | "Pending close";
  purchasePrice: number; // local, millions
  debtFundedPct: number;
  entityName: string;
  entityCountry: string;
  perimeterImpact: string;
  stream: StreamParams | null;
}

export interface CompanySeed {
  master: Omit<Company, "vintage" | "lastReportedMonth">;
  /** Last month index with submitted data (defaults to the last closed month). */
  reportedThrough?: number;
  stream: StreamParams;
  acquisitions: AcquisitionSeed[];
  /** Planned revenue growth used when the annual budget was approved (by budget year). */
  budgetGrowth: Record<number, number>;
  /** Planned change (pp of revenue) to cost ratios in the budget versus the opening run-rate. */
  budgetCostShift: number;
  budgetCashConversion: number;
  hasBudget: boolean;
  budgetCashFlowProvided: boolean;
  debt0: number;
  interestRate: number;
  amortization: number;
  cash0: number;
  /** Optional reclassification: from month, move pct-of-revenue from G&A into other COGS. */
  reclass?: { fromMonth: number; pct: number };
  entities?: { name: string; country: string; currency: string; role: "Operating" | "IP holding" | "Shared services"; share: number; icRevenuePct: number }[];
  utilization?: Path;
  nrr?: Path;
  laborSplitProvided: boolean;
}

const FLAT = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
const SAAS_SERVICES = [0.98, 0.98, 1.01, 0.99, 1.0, 1.01, 0.98, 0.98, 1.01, 1.01, 1.0, 1.05];
const MANAGED = [0.97, 0.97, 1.01, 1.0, 1.01, 1.0, 0.99, 0.98, 1.02, 1.03, 1.0, 1.02];
const PROFESSIONAL = [0.96, 0.98, 1.03, 1.01, 1.02, 1.0, 0.96, 0.93, 1.03, 1.05, 1.03, 1.0];
const STAFFING = [0.95, 0.97, 1.0, 1.01, 1.03, 1.04, 1.02, 1.02, 1.01, 1.0, 0.99, 0.96];

const c = (v: number): Path => [[0, v]];

export const COMPANY_SEEDS: CompanySeed[] = [
  {
    master: {
      id: "atlas-software",
      name: "Atlas Software",
      fund: "fund-iii",
      sector: "Software",
      subsector: "Vertical SaaS",
      businessModel: "Subscription software",
      description: "Vertical SaaS for multi-site property operators; subscription-led with implementation services.",
      headquarters: "Austin, TX",
      geography: "North America",
      investmentDate: "2023-09-15",
      ownership: "Majority",
      ownershipPct: 78,
      baseCurrency: "USD",
      fiscalYearEnd: "December",
      accountingSystem: "DualEntry",
      connection: "dualentry",
      entityCount: 7,
      dataSource: "DualEntry ledger · live sync (authorized)",
      lastUpdated: "2026-10-14T06:00:00Z",
      dataQuality: "High",
      hasArr: true,
      financeLead: { name: "Priya Raman", title: "CFO", email: "priya.raman@atlassoftware.example" },
      definitionNotes: [],
      missingFields: [],
      closeDays: 5,
    },
    stream: {
      base: 3.35, growth: [[0, 0.255], [32, 0.215]], subscription: true, servicesRatio: 0.13, seasonality: SAAS_SERVICES,
      directLaborPct: c(0.13), otherCogsPct: [[0, 0.105], [32, 0.098]],
      smPct: [[0, 0.245], [32, 0.222]], rdPct: [[0, 0.172], [32, 0.165]], gaPct: [[0, 0.142], [32, 0.128]], otherOpexPct: c(0.021),
      personnel: { sm: 0.62, rd: 0.86, ga: 0.55 }, dso: c(44), dpo: 32, deferredMonths: 4.6, capexPct: 0.032, noise: 0.012,
      compPerHead: 0.145, wageInflation: 0.04, acv: 0.031,
    },
    acquisitions: [
      {
        id: "tx-atlas-ledgerline", target: "Ledgerline Ltd", type: "Tuck-in acquisition", announced: "2024-01-22", closed: "2024-03-01",
        integrationStatus: "Integrated", purchasePrice: 14, debtFundedPct: 0.7, entityName: "Ledgerline Ltd", entityCountry: "United Kingdom",
        perimeterImpact: "Adds UK subscription revenue (~$3.6M ARR at close). Periods spanning Mar 2024 are acquisition-affected.",
        stream: {
          base: 0.3, growth: c(0.18), subscription: true, servicesRatio: 0.08, seasonality: FLAT,
          directLaborPct: c(0.15), otherCogsPct: c(0.11), smPct: c(0.2), rdPct: c(0.18), gaPct: c(0.16), otherOpexPct: c(0.02),
          personnel: { sm: 0.6, rd: 0.85, ga: 0.55 }, dso: c(40), dpo: 30, deferredMonths: 4, capexPct: 0.02, noise: 0.015,
          compPerHead: 0.11, wageInflation: 0.04, acv: 0.024,
        },
      },
    ],
    budgetGrowth: { 2024: 0.27, 2025: 0.24, 2026: 0.22 },
    budgetCostShift: -0.005, budgetCashConversion: 0.85, hasBudget: true, budgetCashFlowProvided: true,
    debt0: 26, interestRate: 0.092, amortization: 0.065, cash0: 16,
    entities: [
      { name: "Atlas Software Inc.", country: "United States", currency: "USD", role: "Operating", share: 0.66, icRevenuePct: 0 },
      { name: "Atlas Software Canada ULC", country: "Canada", currency: "CAD", role: "Operating", share: 0.1, icRevenuePct: 0 },
      { name: "Atlas Software GmbH", country: "Germany", currency: "EUR", role: "Operating", share: 0.09, icRevenuePct: 0 },
      { name: "Atlas Software Pty Ltd", country: "Australia", currency: "AUD", role: "Operating", share: 0.06, icRevenuePct: 0 },
      { name: "Atlas IP Holdings LLC", country: "United States", currency: "USD", role: "IP holding", share: 0, icRevenuePct: 0.08 },
      { name: "Atlas Software India Pvt Ltd", country: "India", currency: "INR", role: "Shared services", share: 0, icRevenuePct: 0.055 },
    ],
    nrr: [[0, 1.11], [32, 1.13]],
    laborSplitProvided: true,
  },
  {
    master: {
      id: "beacon-analytics",
      name: "Beacon Analytics",
      fund: "fund-iii",
      sector: "Software",
      subsector: "B2B Analytics",
      businessModel: "Subscription software",
      description: "Revenue analytics platform for B2B go-to-market teams.",
      headquarters: "Boston, MA",
      geography: "North America",
      investmentDate: "2024-03-04",
      ownership: "Majority",
      ownershipPct: 64,
      baseCurrency: "USD",
      fiscalYearEnd: "December",
      accountingSystem: "DualEntry",
      connection: "dualentry",
      entityCount: 2,
      dataSource: "DualEntry ledger · live sync (authorized)",
      lastUpdated: "2026-10-14T06:00:00Z",
      dataQuality: "High",
      hasArr: true,
      financeLead: { name: "Marcus Ellery", title: "VP Finance", email: "marcus.ellery@beaconanalytics.example" },
      definitionNotes: [],
      missingFields: [],
      closeDays: 4,
    },
    stream: {
      base: 1.66, growth: [[0, 0.26], [12, 0.29], [24, 0.35], [32, 0.385]], subscription: true, servicesRatio: 0.09, seasonality: SAAS_SERVICES,
      directLaborPct: c(0.118), otherCogsPct: c(0.102),
      smPct: [[0, 0.405], [32, 0.292]], rdPct: [[0, 0.242], [32, 0.188]], gaPct: [[0, 0.142], [32, 0.108]], otherOpexPct: c(0.02),
      personnel: { sm: 0.64, rd: 0.88, ga: 0.56 }, dso: c(42), dpo: 30, deferredMonths: 5, capexPct: 0.02, noise: 0.012,
      compPerHead: 0.158, wageInflation: 0.045, acv: 0.042,
    },
    acquisitions: [],
    budgetGrowth: { 2024: 0.27, 2025: 0.3, 2026: 0.33 },
    budgetCostShift: -0.01, budgetCashConversion: 0.9, hasBudget: true, budgetCashFlowProvided: true,
    debt0: 8, interestRate: 0.095, amortization: 0.02, cash0: 22,
    entities: [
      { name: "Beacon Analytics Inc.", country: "United States", currency: "USD", role: "Operating", share: 0.92, icRevenuePct: 0 },
      { name: "Beacon Analytics Ltd", country: "United Kingdom", currency: "GBP", role: "Operating", share: 0.08, icRevenuePct: 0 },
    ],
    nrr: [[0, 1.09], [32, 1.18]],
    laborSplitProvided: true,
  },
  {
    master: {
      id: "cedar-cloud",
      name: "Cedar Cloud",
      fund: "fund-ii",
      sector: "Software",
      subsector: "Infrastructure Software",
      businessModel: "Subscription software",
      description: "Backup and observability infrastructure software for mid-market IT teams.",
      headquarters: "Denver, CO",
      geography: "North America",
      investmentDate: "2021-06-14",
      ownership: "Majority",
      ownershipPct: 85,
      baseCurrency: "USD",
      fiscalYearEnd: "December",
      accountingSystem: "NetSuite",
      connection: "upload",
      entityCount: 2,
      dataSource: "NetSuite export · uploaded by Northbridge",
      lastUpdated: "2026-10-09T15:42:00Z",
      dataQuality: "High",
      hasArr: true,
      financeLead: { name: "Elena Sokolova", title: "CFO", email: "elena.sokolova@cedarcloud.example" },
      definitionNotes: [],
      missingFields: ["Balance sheet detail (AR, deferred revenue, AP)", "Working-capital bridge"],
      closeDays: 9,
    },
    stream: {
      base: 3.4, growth: [[0, 0.162], [32, 0.148]], subscription: true, servicesRatio: 0.08, seasonality: SAAS_SERVICES,
      directLaborPct: c(0.092), otherCogsPct: c(0.188),
      smPct: [[0, 0.165], [32, 0.158]], rdPct: c(0.152), gaPct: [[0, 0.094], [32, 0.088]], otherOpexPct: c(0.015),
      personnel: { sm: 0.6, rd: 0.86, ga: 0.52 }, dso: c(40), dpo: 34, deferredMonths: 4.2, capexPct: 0.028, noise: 0.008,
      compPerHead: 0.15, wageInflation: 0.04, acv: 0.026,
    },
    acquisitions: [],
    budgetGrowth: { 2024: 0.16, 2025: 0.16, 2026: 0.15 },
    budgetCostShift: -0.003, budgetCashConversion: 0.86, hasBudget: true, budgetCashFlowProvided: true,
    debt0: 36, interestRate: 0.085, amortization: 0.09, cash0: 15,
    nrr: [[0, 1.1], [32, 1.09]],
    laborSplitProvided: true,
  },
  {
    master: {
      id: "northstar-systems",
      name: "Northstar Systems",
      fund: "fund-ii",
      sector: "Software",
      subsector: "Enterprise Software",
      businessModel: "Subscription software",
      description: "Enterprise asset-management software for utilities and municipalities.",
      headquarters: "Chicago, IL",
      geography: "North America",
      investmentDate: "2020-11-02",
      ownership: "Majority",
      ownershipPct: 91,
      baseCurrency: "USD",
      fiscalYearEnd: "December",
      accountingSystem: "DualEntry",
      connection: "dualentry",
      entityCount: 4,
      dataSource: "DualEntry ledger · live sync (authorized)",
      lastUpdated: "2026-10-14T06:00:00Z",
      dataQuality: "High",
      hasArr: true,
      financeLead: { name: "Tom Brekke", title: "CFO", email: "tom.brekke@northstarsystems.example" },
      definitionNotes: [],
      missingFields: [],
      closeDays: 6,
    },
    stream: {
      base: 6.05, growth: [[0, 0.092], [32, 0.084]], subscription: true, servicesRatio: 0.28, seasonality: SAAS_SERVICES,
      directLaborPct: c(0.168), otherCogsPct: c(0.128),
      smPct: [[0, 0.205], [32, 0.188]], rdPct: [[0, 0.182], [32, 0.168]], gaPct: [[0, 0.104], [32, 0.094]], otherOpexPct: c(0.02),
      personnel: { sm: 0.6, rd: 0.86, ga: 0.54 }, dso: c(58), dpo: 34, deferredMonths: 3.8, capexPct: 0.03, noise: 0.008,
      compPerHead: 0.138, wageInflation: 0.04, acv: 0.21,
    },
    acquisitions: [
      {
        id: "tx-northstar-vantage", target: "Vantage Data Systems", type: "Add-on acquisition", announced: "2026-02-17", closed: "2026-05-01",
        integrationStatus: "Integrating", purchasePrice: 42, debtFundedPct: 0.8, entityName: "Vantage Data Systems LLC", entityCountry: "United States",
        perimeterImpact: "Adds ~$17M annualized revenue at a lower margin from May 2026. Q2 2026+ comparisons are acquisition-affected; organic growth is computable from entity-level ledger data.",
        stream: {
          base: 1.32, growth: c(0.06), subscription: false, seasonality: MANAGED,
          directLaborPct: c(0.36), otherCogsPct: c(0.155), smPct: c(0.08), rdPct: c(0.06), gaPct: c(0.17), otherOpexPct: c(0.045),
          personnel: { sm: 0.6, rd: 0.85, ga: 0.6 }, dso: c(62), dpo: 30, deferredMonths: 0, capexPct: 0.015, noise: 0.012,
          compPerHead: 0.105, wageInflation: 0.04,
        },
      },
    ],
    budgetGrowth: { 2024: 0.09, 2025: 0.09, 2026: 0.085 },
    budgetCostShift: -0.004, budgetCashConversion: 0.84, hasBudget: true, budgetCashFlowProvided: true,
    debt0: 52, interestRate: 0.088, amortization: 0.13, cash0: 24,
    entities: [
      { name: "Northstar Systems Inc.", country: "United States", currency: "USD", role: "Operating", share: 0.86, icRevenuePct: 0 },
      { name: "Northstar Systems Ltd", country: "United Kingdom", currency: "GBP", role: "Operating", share: 0.14, icRevenuePct: 0 },
      { name: "Northstar Shared Services Pvt Ltd", country: "India", currency: "INR", role: "Shared services", share: 0, icRevenuePct: 0.045 },
    ],
    nrr: [[0, 1.05], [32, 1.04]],
    laborSplitProvided: true,
  },
  {
    master: {
      id: "meridian-services",
      name: "Meridian Services",
      fund: "fund-ii",
      sector: "Business Services",
      subsector: "Facilities & Commercial Services",
      businessModel: "Recurring managed services",
      description: "Outsourced facilities and commercial operations services under multi-year contracts.",
      headquarters: "Atlanta, GA",
      geography: "North America",
      investmentDate: "2022-04-11",
      ownership: "Majority",
      ownershipPct: 82,
      baseCurrency: "USD",
      fiscalYearEnd: "December",
      accountingSystem: "NetSuite",
      connection: "upload",
      entityCount: 4,
      dataSource: "NetSuite export · uploaded by Northbridge",
      lastUpdated: "2026-10-12T21:05:00Z",
      dataQuality: "Medium",
      hasArr: false,
      financeLead: { name: "Gavin Ortiz", title: "CFO", email: "gavin.ortiz@meridianservices.example" },
      definitionNotes: [{ kind: "definition", text: "Keystone Facility Partners consolidated via spreadsheet top-side entries; entity-level detail not submitted." }],
      missingFields: ["Entity-level P&L", "Balance sheet detail (AR, deferred revenue, AP)", "Working-capital bridge"],
      closeDays: 14,
    },
    stream: {
      base: 7.82, growth: [[0, 0.088], [18, 0.116], [32, 0.14]], subscription: false, seasonality: MANAGED,
      directLaborPct: [[0, 0.566], [18, 0.576], [32, 0.641]], otherCogsPct: c(0.072),
      smPct: c(0.031), rdPct: null, gaPct: [[0, 0.093], [18, 0.094], [32, 0.104]], otherOpexPct: c(0.036),
      personnel: { sm: 0.62, rd: 0, ga: 0.66 }, dso: c(52), dpo: 28, deferredMonths: 0, capexPct: 0.012, noise: 0.009,
      compPerHead: 0.054, wageInflation: 0.058,
    },
    acquisitions: [
      {
        id: "tx-meridian-keystone", target: "Keystone Facility Partners", type: "Add-on acquisition", announced: "2025-05-06", closed: "2025-07-01",
        integrationStatus: "Integrating", purchasePrice: 24, debtFundedPct: 0.85, entityName: "Keystone Facility Partners LLC", entityCountry: "United States",
        perimeterImpact: "Adds ~$12M annualized revenue from Jul 2025. Comparisons spanning Jul 2025 (e.g. Q3 2025 YoY, TTM to Sep 2026) are acquisition-affected; Q3 2026 vs Q3 2025 is constant-perimeter.",
        stream: {
          base: 0.98, growth: c(0.075), subscription: false, seasonality: MANAGED,
          directLaborPct: [[18, 0.62], [32, 0.648]], otherCogsPct: c(0.07), smPct: c(0.025), rdPct: null, gaPct: c(0.11), otherOpexPct: c(0.04),
          personnel: { sm: 0.6, rd: 0, ga: 0.68 }, dso: c(55), dpo: 28, deferredMonths: 0, capexPct: 0.01, noise: 0.012,
          compPerHead: 0.052, wageInflation: 0.06,
        },
      },
    ],
    budgetGrowth: { 2024: 0.09, 2025: 0.1, 2026: 0.115 },
    budgetCostShift: -0.004, budgetCashConversion: 0.8, hasBudget: true, budgetCashFlowProvided: true,
    debt0: 40, interestRate: 0.09, amortization: 0.1, cash0: 12,
    laborSplitProvided: true,
  },
  {
    master: {
      id: "horizon-advisory",
      name: "Horizon Advisory",
      fund: "fund-ii",
      sector: "Business Services",
      subsector: "Professional Services",
      businessModel: "Project-based services",
      description: "Operational advisory and transformation consulting for UK and European mid-market clients.",
      headquarters: "London, UK",
      geography: "UK & Europe",
      investmentDate: "2022-08-30",
      ownership: "Majority",
      ownershipPct: 70,
      baseCurrency: "GBP",
      fiscalYearEnd: "March",
      accountingSystem: "QuickBooks Online",
      connection: "upload",
      entityCount: 2,
      dataSource: "QuickBooks Online export · uploaded by Northbridge",
      lastUpdated: "2026-10-10T09:18:00Z",
      dataQuality: "Medium",
      hasArr: false,
      financeLead: { name: "Harriet Cole", title: "Finance Director", email: "harriet.cole@horizonadvisory.example" },
      definitionNotes: [{ kind: "context", text: "Reports in GBP; translated to USD at monthly average (P&L) and month-end (balances) synthetic rates." }, { kind: "context", text: "Fiscal year ends March; portfolio views are calendarised from monthly data." }],
      missingFields: ["Balance sheet detail (AR, deferred revenue, AP)", "Working-capital bridge"],
      closeDays: 11,
    },
    stream: {
      base: 2.19, growth: [[0, 0.064], [32, 0.032]], subscription: false, seasonality: PROFESSIONAL,
      directLaborPct: [[0, 0.502], [32, 0.556]], otherCogsPct: c(0.05),
      smPct: c(0.05), rdPct: null, gaPct: [[0, 0.178], [32, 0.198]], otherOpexPct: c(0.03),
      personnel: { sm: 0.7, rd: 0, ga: 0.72 }, dso: c(64), dpo: 26, deferredMonths: 0, capexPct: 0.006, noise: 0.012,
      compPerHead: 0.072, wageInflation: 0.055,
    },
    acquisitions: [],
    budgetGrowth: { 2024: 0.07, 2025: 0.06, 2026: 0.05 },
    budgetCostShift: -0.004, budgetCashConversion: 0.82, hasBudget: true, budgetCashFlowProvided: true,
    debt0: 12, interestRate: 0.082, amortization: 0.03, cash0: 6,
    utilization: [[0, 0.752], [32, 0.684]],
    laborSplitProvided: true,
  },
  {
    master: {
      id: "summit-compliance",
      name: "Summit Compliance",
      fund: "fund-iii",
      sector: "Business Services",
      subsector: "Regulatory Services",
      businessModel: "Recurring managed services",
      description: "Outsourced regulatory filing, licensing and compliance monitoring for financial-services firms.",
      headquarters: "Charlotte, NC",
      geography: "North America",
      investmentDate: "2023-02-21",
      ownership: "Majority",
      ownershipPct: 75,
      baseCurrency: "USD",
      fiscalYearEnd: "June",
      accountingSystem: "Sage Intacct",
      connection: "upload",
      entityCount: 3,
      dataSource: "Sage Intacct export · uploaded by Northbridge",
      lastUpdated: "2026-10-11T13:30:00Z",
      dataQuality: "Medium",
      hasArr: false,
      financeLead: { name: "Olivia Hart", title: "CFO", email: "olivia.hart@summitcompliance.example" },
      definitionNotes: [{ kind: "definition", text: "From Jan 2026, cloud hosting costs reclassified from G&A into cost of services (reported in submission notes)." }, { kind: "context", text: "Fiscal year ends June; portfolio views are calendarised from monthly data." }],
      missingFields: ["Balance sheet detail (AR, deferred revenue, AP)", "Working-capital bridge"],
      closeDays: 10,
    },
    stream: {
      base: 3.12, growth: [[0, 0.152], [32, 0.13]], subscription: false, seasonality: MANAGED,
      directLaborPct: c(0.318), otherCogsPct: c(0.098),
      smPct: c(0.068), rdPct: null, gaPct: c(0.172), otherOpexPct: c(0.022),
      personnel: { sm: 0.65, rd: 0, ga: 0.6 }, dso: [[0, 58], [12, 66], [24, 82], [32, 101]], dpo: 30, deferredMonths: 0, capexPct: 0.014, noise: 0.009,
      compPerHead: 0.088, wageInflation: 0.045,
    },
    acquisitions: [],
    budgetGrowth: { 2024: 0.15, 2025: 0.15, 2026: 0.14 },
    budgetCostShift: -0.002, budgetCashConversion: 0.8, hasBudget: true, budgetCashFlowProvided: true,
    debt0: 30, interestRate: 0.091, amortization: 0.075, cash0: 9,
    reclass: { fromMonth: 24, pct: 0.031 },
    laborSplitProvided: true,
  },
  {
    master: {
      id: "crestpoint-consulting",
      name: "Crestpoint Consulting",
      fund: "fund-iii",
      sector: "Business Services",
      subsector: "IT Services",
      businessModel: "Project-based services",
      description: "ERP and data-platform implementation partner for mid-market manufacturers.",
      headquarters: "Columbus, OH",
      geography: "North America",
      investmentDate: "2024-01-10",
      ownership: "Majority",
      ownershipPct: 68,
      baseCurrency: "USD",
      fiscalYearEnd: "December",
      accountingSystem: "QuickBooks Desktop",
      connection: "upload",
      entityCount: 1,
      dataSource: "QuickBooks Desktop + Excel · uploaded by Northbridge",
      lastUpdated: "2026-10-13T17:02:00Z",
      dataQuality: "Medium",
      hasArr: false,
      financeLead: { name: "Ben Achterberg", title: "Controller", email: "ben.achterberg@crestpointconsulting.example" },
      definitionNotes: [{ kind: "definition", text: "Commissions recorded in G&A rather than S&M; S&M ratio understated versus peers." }],
      missingFields: ["Budget cash flow", "Balance sheet detail (AR, deferred revenue, AP)"],
      closeDays: 15,
    },
    stream: {
      base: 2.2, growth: [[0, 0.064], [32, 0.03]], subscription: false, seasonality: PROFESSIONAL,
      directLaborPct: [[0, 0.598], [32, 0.62]], otherCogsPct: c(0.078),
      smPct: c(0.045), rdPct: null, gaPct: c(0.128), otherOpexPct: c(0.032),
      personnel: { sm: 0.7, rd: 0, ga: 0.66 }, dso: c(68), dpo: 30, deferredMonths: 0, capexPct: 0.008, noise: 0.014,
      compPerHead: 0.098, wageInflation: 0.045,
    },
    acquisitions: [],
    budgetGrowth: { 2024: 0.17, 2025: 0.18, 2026: 0.18 },
    budgetCostShift: -0.006, budgetCashConversion: 0.8, hasBudget: true, budgetCashFlowProvided: false,
    debt0: 8, interestRate: 0.094, amortization: 0.02, cash0: 4,
    utilization: [[0, 0.781], [32, 0.722]],
    laborSplitProvided: true,
  },
  {
    master: {
      id: "harbor-operations",
      name: "Harbor Operations",
      fund: "fund-ii",
      sector: "Business Services",
      subsector: "Outsourced Business Services",
      businessModel: "Recurring managed services",
      description: "Outsourced claims, billing and back-office processing for insurers and healthcare payers.",
      headquarters: "Tampa, FL",
      geography: "North America",
      investmentDate: "2021-09-27",
      ownership: "Majority",
      ownershipPct: 88,
      baseCurrency: "USD",
      fiscalYearEnd: "December",
      accountingSystem: "Sage Intacct",
      connection: "upload",
      entityCount: 3,
      dataSource: "Sage Intacct export · uploaded by Northbridge",
      lastUpdated: "2026-10-08T19:44:00Z",
      dataQuality: "High",
      hasArr: false,
      financeLead: { name: "Renee Albright", title: "CFO", email: "renee.albright@harboroperations.example" },
      definitionNotes: [],
      missingFields: ["Entity-level P&L", "Balance sheet detail (AR, deferred revenue, AP)"],
      closeDays: 10,
    },
    stream: {
      base: 5.8, growth: [[0, 0.088], [32, 0.09]], subscription: false, seasonality: MANAGED,
      directLaborPct: c(0.522), otherCogsPct: c(0.088),
      smPct: c(0.038), rdPct: null, gaPct: [[0, 0.132], [32, 0.126]], otherOpexPct: c(0.048),
      personnel: { sm: 0.62, rd: 0, ga: 0.62 }, dso: c(48), dpo: 30, deferredMonths: 0, capexPct: 0.018, noise: 0.008,
      compPerHead: 0.061, wageInflation: 0.04,
    },
    acquisitions: [
      {
        id: "tx-harbor-tidewater", target: "Tidewater Claims Processing", type: "Tuck-in acquisition", announced: "2025-11-03", closed: "2026-01-01",
        integrationStatus: "Integrating", purchasePrice: 15, debtFundedPct: 0.75, entityName: "Tidewater Claims Processing Inc.", entityCountry: "United States",
        perimeterImpact: "Adds ~$6.5M annualized revenue from Jan 2026. Year-over-year comparisons in 2026 are acquisition-affected; organic split is not available from uploaded data.",
        stream: {
          base: 0.53, growth: c(0.07), subscription: false, seasonality: MANAGED,
          directLaborPct: c(0.55), otherCogsPct: c(0.09), smPct: c(0.03), rdPct: null, gaPct: c(0.14), otherOpexPct: c(0.05),
          personnel: { sm: 0.6, rd: 0, ga: 0.62 }, dso: c(50), dpo: 30, deferredMonths: 0, capexPct: 0.012, noise: 0.012,
          compPerHead: 0.058, wageInflation: 0.04,
        },
      },
    ],
    budgetGrowth: { 2024: 0.09, 2025: 0.09, 2026: 0.09 },
    budgetCostShift: -0.003, budgetCashConversion: 0.82, hasBudget: true, budgetCashFlowProvided: true,
    debt0: 32, interestRate: 0.087, amortization: 0.08, cash0: 11,
    laborSplitProvided: true,
  },
  {
    master: {
      id: "lattice-technologies",
      name: "Lattice Technologies",
      fund: "fund-iii",
      sector: "Software",
      subsector: "Developer Software",
      businessModel: "Subscription software",
      description: "API testing and release-quality software for engineering teams.",
      headquarters: "Seattle, WA",
      geography: "North America",
      investmentDate: "2025-02-18",
      ownership: "Minority (growth)",
      ownershipPct: 38,
      baseCurrency: "USD",
      fiscalYearEnd: "December",
      accountingSystem: "DualEntry",
      connection: "dualentry",
      entityCount: 2,
      dataSource: "DualEntry ledger · live sync (authorized)",
      lastUpdated: "2026-10-14T06:00:00Z",
      dataQuality: "High",
      hasArr: true,
      financeLead: { name: "Jae-won Park", title: "Head of Finance", email: "jaewon.park@latticetechnologies.example" },
      definitionNotes: [{ kind: "context", text: "Pre-investment periods (Jan 2024 – Jan 2025) sourced from diligence quality-of-earnings data." }],
      missingFields: [],
      closeDays: 4,
    },
    stream: {
      base: 0.74, growth: [[0, 0.33], [32, 0.27]], subscription: true, servicesRatio: 0.06, seasonality: FLAT,
      directLaborPct: c(0.082), otherCogsPct: c(0.118),
      smPct: [[0, 0.42], [32, 0.33]], rdPct: [[0, 0.3], [32, 0.262]], gaPct: [[0, 0.158], [32, 0.128]], otherOpexPct: c(0.02),
      personnel: { sm: 0.66, rd: 0.9, ga: 0.55 }, dso: c(38), dpo: 30, deferredMonths: 5.4, capexPct: 0.015, noise: 0.014,
      compPerHead: 0.17, wageInflation: 0.045, acv: 0.0185,
    },
    acquisitions: [],
    budgetGrowth: { 2024: 0.32, 2025: 0.3, 2026: 0.28 },
    budgetCostShift: -0.01, budgetCashConversion: 0.9, hasBudget: true, budgetCashFlowProvided: true,
    debt0: 0, interestRate: 0, amortization: 0, cash0: 19,
    entities: [
      { name: "Lattice Technologies Inc.", country: "United States", currency: "USD", role: "Operating", share: 0.94, icRevenuePct: 0 },
      { name: "Lattice Technologies Canada Inc.", country: "Canada", currency: "CAD", role: "Operating", share: 0.06, icRevenuePct: 0 },
    ],
    nrr: [[0, 1.16], [32, 1.14]],
    laborSplitProvided: true,
  },
  {
    master: {
      id: "apex-workforce",
      name: "Apex Workforce",
      fund: "fund-ii",
      sector: "Business Services",
      subsector: "Workforce Services",
      businessModel: "Workforce & staffing",
      description: "Light-industrial and logistics staffing across the US Midwest and Southeast.",
      headquarters: "Indianapolis, IN",
      geography: "North America",
      investmentDate: "2020-03-16",
      ownership: "Majority",
      ownershipPct: 80,
      baseCurrency: "USD",
      fiscalYearEnd: "December",
      accountingSystem: "Microsoft Dynamics GP",
      connection: "upload",
      entityCount: 5,
      dataSource: "Emailed Excel pack · uploaded by Northbridge",
      lastUpdated: "2026-07-24T16:10:00Z",
      dataQuality: "Low",
      hasArr: false,
      financeLead: { name: "Craig Donnelly", title: "CFO", email: "craig.donnelly@apexworkforce.example" },
      definitionNotes: [{ kind: "definition", text: "Reporting pack layout changed twice in 2025; mapping maintained manually by the sponsor team." }],
      missingFields: ["Q3 2026 submission (Jul–Sep 2026)", "Balance sheet detail (AR, deferred revenue, AP)", "Working-capital bridge"],
      closeDays: 21,
    },
    stream: {
      base: 8.0, growth: [[0, 0.061], [32, 0.032]], subscription: false, seasonality: STAFFING,
      directLaborPct: [[0, 0.728], [32, 0.736]], otherCogsPct: c(0.041),
      smPct: c(0.041), rdPct: null, gaPct: c(0.091), otherOpexPct: c(0.025),
      personnel: { sm: 0.66, rd: 0, ga: 0.64 }, dso: c(46), dpo: 22, deferredMonths: 0, capexPct: 0.005, noise: 0.012,
      compPerHead: 0.046, wageInflation: 0.04,
    },
    acquisitions: [],
    budgetGrowth: { 2024: 0.06, 2025: 0.06, 2026: 0.05 },
    budgetCostShift: -0.003, budgetCashConversion: 0.75, hasBudget: true, budgetCashFlowProvided: true,
    debt0: 20, interestRate: 0.089, amortization: 0.05, cash0: 8,
    laborSplitProvided: true,
    reportedThrough: 29,
  },
  {
    master: {
      id: "bluepeak-solutions",
      name: "BluePeak Solutions",
      fund: "fund-iii",
      sector: "Business Services",
      subsector: "Technology-Enabled Services",
      businessModel: "Tech-enabled services",
      description: "Managed field-service scheduling and dispatch for HVAC and plumbing contractors.",
      headquarters: "Phoenix, AZ",
      geography: "North America",
      investmentDate: "2025-07-01",
      ownership: "Majority",
      ownershipPct: 60,
      baseCurrency: "USD",
      fiscalYearEnd: "December",
      accountingSystem: "Xero",
      connection: "upload",
      entityCount: 1,
      dataSource: "Emailed PDF/Excel management accounts · uploaded by Northbridge",
      lastUpdated: "2026-09-26T11:20:00Z",
      dataQuality: "Low",
      hasArr: false,
      financeLead: { name: "Sofia Mendes", title: "Finance Manager", email: "sofia.mendes@bluepeaksolutions.example" },
      definitionNotes: [{ kind: "definition", text: "Labor costs reported within COGS and opex without a personnel split; labor metrics unavailable." }, { kind: "context", text: "Pre-investment periods sourced from diligence data." }],
      missingFields: ["September 2026 month", "Labor cost split", "Budget (FY2024–FY2026)", "Balance sheet detail", "Working-capital bridge"],
      closeDays: 18,
    },
    stream: {
      base: 0.75, growth: [[0, 0.205], [32, 0.178]], subscription: false, seasonality: MANAGED,
      directLaborPct: c(0.402), otherCogsPct: c(0.102),
      smPct: c(0.098), rdPct: null, gaPct: c(0.196), otherOpexPct: c(0.062),
      personnel: { sm: 0.65, rd: 0, ga: 0.6 }, dso: c(35), dpo: 28, deferredMonths: 0, capexPct: 0.02, noise: 0.016,
      compPerHead: 0.068, wageInflation: 0.045,
    },
    acquisitions: [
      {
        id: "tx-bluepeak-coolroute", target: "CoolRoute Dispatch", type: "Tuck-in acquisition", announced: "2026-09-08", closed: null,
        integrationStatus: "Pending close", purchasePrice: 6, debtFundedPct: 0.6, entityName: "CoolRoute Dispatch LLC", entityCountry: "United States",
        perimeterImpact: "Signed, not closed. No reporting-perimeter impact until close (expected Q4 2026).",
        stream: null,
      },
    ],
    budgetGrowth: { 2024: 0.2, 2025: 0.2, 2026: 0.18 },
    budgetCostShift: 0, budgetCashConversion: 0.8, hasBudget: false, budgetCashFlowProvided: false,
    debt0: 3, interestRate: 0.095, amortization: 0.007, cash0: 3,
    laborSplitProvided: false,
    reportedThrough: 31,
  },
];
