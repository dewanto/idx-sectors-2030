/**
 * IDX Sectors 2030 — deterministic seed.
 * Builds the full evidence graph: SDG framework → companies → business events
 * → market series → execution/timing/market scores → signals → briefs.
 * Demo dataset for the Sectors Hackathon 2026.
 */
import { db } from "./index";
import * as s from "./schema";
import { sql } from "drizzle-orm";
import { mulberry32, hashStr, businessDaysBack } from "../lib/prng";
import { marketIntelligenceScore } from "../lib/marketIntel";
import { priceFloorBandFor } from "../lib/regime";

const BEI_RULE_NOTE =
  "Time-versioned configuration from current BEI market-rule reporting. Describes daily price-movement mechanics and downside asymmetry only - never a valuation signal, stop-loss or support level.";
import {
  computeTimingScore,
  deriveTimingClass,
  computeMarketScore,
  computeConfluence,
} from "../lib/scoring";
import {
  SYSTEM_DATE,
  DEADLINE_2030,
  STAGE_META,
  parseDate,
  daysBetween,
  type Stage,
} from "../lib/system";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* 1. SDG goals (official UN colour codes)                              */
/* ------------------------------------------------------------------ */

const GOALS: { n: number; title: string; short: string; color: string; desc: string }[] = [
  { n: 1, title: "No Poverty", short: "No Poverty", color: "#E5243B", desc: "End poverty in all its forms everywhere." },
  { n: 2, title: "Zero Hunger", short: "Zero Hunger", color: "#DDA63A", desc: "End hunger, achieve food security and improved nutrition and promote sustainable agriculture." },
  { n: 3, title: "Good Health and Well-Being", short: "Good Health", color: "#4C9F38", desc: "Ensure healthy lives and promote well-being for all at all ages." },
  { n: 4, title: "Quality Education", short: "Education", color: "#C5192D", desc: "Ensure inclusive and equitable quality education and promote lifelong learning opportunities for all." },
  { n: 5, title: "Gender Equality", short: "Gender Equality", color: "#FF3A21", desc: "Achieve gender equality and empower all women and girls." },
  { n: 6, title: "Clean Water and Sanitation", short: "Clean Water", color: "#26BDE2", desc: "Ensure availability and sustainable management of water and sanitation for all." },
  { n: 7, title: "Affordable and Clean Energy", short: "Clean Energy", color: "#FCC30B", desc: "Ensure access to affordable, reliable, sustainable and modern energy for all." },
  { n: 8, title: "Decent Work and Economic Growth", short: "Decent Work", color: "#A21942", desc: "Promote sustained, inclusive and sustainable economic growth, full and productive employment and decent work for all." },
  { n: 9, title: "Industry, Innovation and Infrastructure", short: "Industry & Infra", color: "#FD6925", desc: "Build resilient infrastructure, promote inclusive and sustainable industrialization and foster innovation." },
  { n: 10, title: "Reduced Inequalities", short: "Reduced Inequalities", color: "#DD1367", desc: "Reduce inequality within and among countries." },
  { n: 11, title: "Sustainable Cities and Communities", short: "Sustainable Cities", color: "#FD9D24", desc: "Make cities and human settlements inclusive, safe, resilient and sustainable." },
  { n: 12, title: "Responsible Consumption and Production", short: "Responsible Consumption", color: "#BF8B2E", desc: "Ensure sustainable consumption and production patterns." },
  { n: 13, title: "Climate Action", short: "Climate Action", color: "#3F7E44", desc: "Take urgent action to combat climate change and its impacts." },
  { n: 14, title: "Life Below Water", short: "Life Below Water", color: "#0A97D9", desc: "Conserve and sustainably use the oceans, seas and marine resources for sustainable development." },
  { n: 15, title: "Life on Land", short: "Life on Land", color: "#56C02B", desc: "Protect, restore and promote sustainable use of terrestrial ecosystems." },
  { n: 16, title: "Peace, Justice and Strong Institutions", short: "Peace & Justice", color: "#00689D", desc: "Promote peaceful and inclusive societies, provide access to justice and build accountable institutions." },
  { n: 17, title: "Partnerships for the Goals", short: "Partnerships", color: "#19486A", desc: "Strengthen the means of implementation and revitalize the global partnership for sustainable development." },
];

const TARGETS: { code: string; goal: number; title: string; keywords: string[] }[] = [
  { code: "1.4", goal: 1, title: "Equal rights to economic resources and access to basic services for the poor", keywords: ["microfinance", "inclusion", "basic services", "UMKM"] },
  { code: "2.4", goal: 2, title: "Sustainable food production systems and resilient agricultural practices", keywords: ["regenerative", "agriculture", "aquaculture", "sourcing"] },
  { code: "3.8", goal: 3, title: "Universal health coverage, access to quality essential health-care services and medicines", keywords: ["hospital", "medicine", "biologics", "healthcare access"] },
  { code: "4.4", goal: 4, title: "Increase the number of youth and adults with relevant skills for employment", keywords: ["digital talent", "academy", "vocational", "skills"] },
  { code: "5.a", goal: 5, title: "Reforms to give women equal rights to economic resources", keywords: ["women-led", "MSME", "financing"] },
  { code: "6.1", goal: 6, title: "Universal and equitable access to safe and affordable drinking water", keywords: ["water treatment", "drinking water", "SPAM"] },
  { code: "6.3", goal: 6, title: "Improve water quality, wastewater treatment and safe reuse", keywords: ["wastewater", "sanitation", "treatment plant"] },
  { code: "7.2", goal: 7, title: "Increase substantially the share of renewable energy in the global energy mix", keywords: ["geothermal", "solar", "renewable", "biofuel", "hybrid power"] },
  { code: "8.5", goal: 8, title: "Full and productive employment and decent work for all", keywords: ["employment", "jobs", "workforce"] },
  { code: "8.10", goal: 8, title: "Expand access to banking, insurance and financial services for all", keywords: ["SME", "lending", "sustainable bond", "financial access"] },
  { code: "9.1", goal: 9, title: "Quality, reliable, sustainable and resilient infrastructure", keywords: ["data center", "infrastructure", "toll", "grid"] },
  { code: "9.2", goal: 9, title: "Inclusive and sustainable industrialization", keywords: ["industrial", "plant", "manufacturing", "industrial zone"] },
  { code: "9.4", goal: 9, title: "Upgrade infrastructure and retrofit industries with clean technology", keywords: ["modernization", "retrofit", "decarbonisation", "efficiency"] },
  { code: "9.c", goal: 9, title: "Universal and affordable access to the Internet", keywords: ["coverage", "5G", "rural connectivity", "towers"] },
  { code: "10.2", goal: 10, title: "Social, economic and political inclusion of all", keywords: ["rural", "inclusion", "digital divide"] },
  { code: "11.2", goal: 11, title: "Safe, affordable and sustainable transport systems", keywords: ["EV fleet", "public transport", "electric vehicles"] },
  { code: "11.3", goal: 11, title: "Inclusive and sustainable urbanization", keywords: ["township", "green building", "urban"] },
  { code: "11.6", goal: 11, title: "Reduce the adverse per capita environmental impact of cities", keywords: ["air quality", "emissions", "electric mobility"] },
  { code: "12.4", goal: 12, title: "Environmentally sound management of chemicals and all wastes", keywords: ["co-processing", "waste", "hazardous"] },
  { code: "12.5", goal: 12, title: "Substantially reduce waste generation through recycling and reuse", keywords: ["recycling", "circular", "plastic waste"] },
  { code: "13.2", goal: 13, title: "Integrate climate change measures into policies, strategies and planning", keywords: ["CCUS", "decarbonisation", "climate transition"] },
  { code: "14.2", goal: 14, title: "Sustainably manage and protect marine and coastal ecosystems", keywords: ["mangrove", "coastal", "restoration"] },
  { code: "15.1", goal: 15, title: "Conservation and restoration of terrestrial ecosystems", keywords: ["rehabilitation", "reclamation", "reforestation"] },
  { code: "17.17", goal: 17, title: "Effective public, public-private and civil society partnerships", keywords: ["PPP", "consortium", "partnership", "government"] },
];

/* ------------------------------------------------------------------ */
/* 2. Companies (IDX universe sample)                                   */
/* ------------------------------------------------------------------ */

interface CompanySeed {
  ticker: string; name: string; sector: string; industry: string;
  mcapBn: number; price: number;
}

const COMPANIES: CompanySeed[] = [
  { ticker: "BBCA", name: "Bank Central Asia Tbk", sector: "Financials", industry: "Banks", mcapBn: 1_180_000, price: 9_550 },
  { ticker: "BBRI", name: "Bank Rakyat Indonesia (Persero) Tbk", sector: "Financials", industry: "Banks", mcapBn: 620_000, price: 4_090 },
  { ticker: "BMRI", name: "Bank Mandiri (Persero) Tbk", sector: "Financials", industry: "Banks", mcapBn: 640_000, price: 6_850 },
  { ticker: "GOTO", name: "GoTo Gojek Tokopedia Tbk", sector: "Technology", industry: "Online Services", mcapBn: 78_000, price: 68 },
  { ticker: "TLKM", name: "Telkom Indonesia (Persero) Tbk", sector: "Infrastructure", industry: "Telecommunications", mcapBn: 287_000, price: 2_900 },
  { ticker: "ISAT", name: "Indosat Tbk", sector: "Infrastructure", industry: "Telecommunications", mcapBn: 76_000, price: 2_360 },
  { ticker: "EXCL", name: "XLSMART Telecom Sejahtera Tbk", sector: "Infrastructure", industry: "Telecommunications", mcapBn: 56_000, price: 2_110 },
  { ticker: "TOWR", name: "Sarana Menara Nusantara Tbk", sector: "Infrastructure", industry: "Telecommunication Infrastructure", mcapBn: 33_000, price: 645 },
  { ticker: "JSMR", name: "Jasa Marga (Persero) Tbk", sector: "Infrastructure", industry: "Toll Road", mcapBn: 35_000, price: 4_820 },
  { ticker: "WIKA", name: "Wijaya Karya (Persero) Tbk", sector: "Infrastructure", industry: "Building Construction", mcapBn: 2_200, price: 244 },
  { ticker: "PTPP", name: "PP (Persero) Tbk", sector: "Infrastructure", industry: "Building Construction", mcapBn: 2_400, price: 382 },
  { ticker: "DMAS", name: "Puradelta Lestari Tbk", sector: "Properties & Real Estate", industry: "Real Estate Management & Development", mcapBn: 8_400, price: 174 },
  { ticker: "CTRA", name: "Ciputra Development Tbk", sector: "Properties & Real Estate", industry: "Real Estate Management & Development", mcapBn: 17_800, price: 960 },
  { ticker: "ASII", name: "Astra International Tbk", sector: "Industrials", industry: "Multi-Sector Holdings", mcapBn: 198_000, price: 4_890 },
  { ticker: "UNTR", name: "United Tractors Tbk", sector: "Industrials", industry: "Heavy Equipment & Machinery", mcapBn: 91_000, price: 24_450 },
  { ticker: "ADRO", name: "Alamtri Resources Indonesia Tbk", sector: "Energy", industry: "Coal", mcapBn: 58_000, price: 1_860 },
  { ticker: "PTBA", name: "Bukit Asam Tbk", sector: "Energy", industry: "Coal", mcapBn: 31_000, price: 2_700 },
  { ticker: "PGAS", name: "Perusahaan Gas Negara Tbk", sector: "Energy", industry: "Oil, Gas & Coal Supports", mcapBn: 41_000, price: 1_700 },
  { ticker: "MEDC", name: "Medco Energi Internasional Tbk", sector: "Energy", industry: "Oil & Gas Production & Refinery", mcapBn: 29_000, price: 1_155 },
  { ticker: "AKRA", name: "AKR Corporindo Tbk", sector: "Energy", industry: "Oil, Gas & Coal Retail", mcapBn: 25_000, price: 1_250 },
  { ticker: "PGEO", name: "Pertamina Geothermal Energy Tbk", sector: "Energy", industry: "Renewable Energy", mcapBn: 45_000, price: 1_090 },
  { ticker: "BREN", name: "Barito Renewables Energy Tbk", sector: "Energy", industry: "Renewable Energy", mcapBn: 1_260_000, price: 9_400 },
  { ticker: "ANTM", name: "Aneka Tambang Tbk", sector: "Basic Materials", industry: "Metals & Minerals", mcapBn: 44_000, price: 1_850 },
  { ticker: "INCO", name: "Vale Indonesia Tbk", sector: "Basic Materials", industry: "Metals & Minerals", mcapBn: 29_000, price: 2_920 },
  { ticker: "AMMN", name: "Amman Mineral Internasional Tbk", sector: "Basic Materials", industry: "Metals & Minerals", mcapBn: 510_000, price: 7_025 },
  { ticker: "SMGR", name: "Semen Indonesia (Persero) Tbk", sector: "Basic Materials", industry: "Cement & Construction Materials", mcapBn: 20_000, price: 3_380 },
  { ticker: "BRPT", name: "Barito Pacific Tbk", sector: "Basic Materials", industry: "Petrochemicals & Specialty Chemicals", mcapBn: 118_000, price: 1_255 },
  { ticker: "BIRD", name: "Blue Bird Tbk", sector: "Transportation & Logistic", industry: "Land Transportation", mcapBn: 3_500, price: 1_400 },
  { ticker: "UNVR", name: "Unilever Indonesia Tbk", sector: "Consumer Non-Cyclicals", industry: "Consumer Goods", mcapBn: 70_000, price: 1_845 },
  { ticker: "INDF", name: "Indofood Tbk", sector: "Consumer Non-Cyclicals", industry: "Food & Beverage", mcapBn: 56_000, price: 6_400 },
  { ticker: "CPIN", name: "Charoen Pokphand Indonesia Tbk", sector: "Consumer Non-Cyclicals", industry: "Food & Beverage", mcapBn: 80_000, price: 4_890 },
  { ticker: "KLBF", name: "Kalbe Farma Tbk", sector: "Healthcare", industry: "Pharmaceuticals", mcapBn: 63_000, price: 1_350 },
  { ticker: "SILO", name: "Siloam International Hospitals Tbk", sector: "Healthcare", industry: "Healthcare Service Providers", mcapBn: 38_000, price: 2_920 },
  { ticker: "SIDO", name: "Industri Jamu dan Farmasi Sido Muncul Tbk", sector: "Healthcare", industry: "Herbal & Traditional Medicine", mcapBn: 16_800, price: 560 },
];

/* ------------------------------------------------------------------ */
/* 3. Business events                                                   */
/* ------------------------------------------------------------------ */

interface MappingSeed {
  goal: number; target: string; rel: "DIRECT" | "INDIRECT" | "ASPIRATIONAL";
  evidence: number; confidence: number; reasoning: string;
}

interface EventSeed {
  ticker: string; type: string; title: string; summary: string;
  date: string; stage: Stage; stageConf: number;
  invBn?: number; capacity?: string; location?: string; counterparty?: string; project?: string;
  plannedStart?: string; expectedCompletion?: string; targetYear?: number;
  source: string; url: string; tier: 1 | 2 | 3 | 4;
  claim: "FACT" | "COMPANY_CLAIM" | "THIRD_PARTY_CLAIM" | "ANALYST_INTERPRETATION";
  evidenceText: string; extractionConf: number; impact: string;
  mapping: MappingSeed; secondary?: MappingSeed;
  market: number; // volume response multiplier
}

const EVENTS: EventSeed[] = [
  /* ---- PGEO — three-stage execution narrative (SDG 7.2) ---- */
  {
    ticker: "PGEO", type: "PROJECT", title: "PGEO allocates 2026 capex toward Ulubelu unit expansion studies",
    summary: "Management outlines 2026 capital allocation prioritising the Ulubelu geothermal complex, with feasibility work for an additional unit flagged in the capex plan.",
    date: "2026-01-15", stage: "INTENT", stageConf: 0.62, invBn: 180, project: "Ulubelu 5 feasibility", location: "Lampung",
    source: "Bisnis Indonesia", url: "https://www.bisnis.com/markets/read/pgeo-capex-ulubelu-2026", tier: 2, claim: "COMPANY_CLAIM",
    evidenceText: "“The 2026 capex plan prioritises brownfield expansion at Ulubelu, subject to feasibility and tender processes,” the company said during its January disclosure call.",
    extractionConf: 0.71, impact: "Early pipeline visibility for an estimated 55 MW of additional renewable capacity.",
    mapping: { goal: 7, target: "7.2", rel: "ASPIRATIONAL", evidence: 58, confidence: 0.66, reasoning: "Capex language signals intent toward additional renewable generation, but no contract, budget line or timeline is yet documented." },
    market: 1.15,
  },
  {
    ticker: "PGEO", type: "INVESTMENT", title: "PGEO board approves Rp2.6T 2026 capex including Ulubelu 5 development budget",
    summary: "Board-approved spending plan formally budgets Ulubelu 5 development, shifting the project from study to committed pipeline with a tender scheduled for Q3 2026.",
    date: "2026-04-22", stage: "COMMITTED", stageConf: 0.85, invBn: 2600, project: "Ulubelu 5", capacity: "55 MW (planned)", location: "Lampung", plannedStart: "2026-10-01",
    source: "IDX Company Disclosure", url: "https://www.idx.co.id/en/listed-companies/company-profiles/", tier: 1, claim: "FACT",
    evidenceText: "The April disclosure lists Rp2.6T of approved capex, including development budget for Ulubelu 5 with procurement targeted in Q3 2026.",
    extractionConf: 0.88, impact: "Committed funding removes the main financing uncertainty for 55 MW of renewable capacity.",
    mapping: { goal: 7, target: "7.2", rel: "DIRECT", evidence: 82, confidence: 0.85, reasoning: "Board-approved budget for a named geothermal unit is documented investment evidence corresponding to renewable-capacity expansion." },
    market: 1.5,
  },
  {
    ticker: "PGEO", type: "CONTRACT", title: "PGEO signs EPC contract for 55 MW Ulubelu 5, commercial operation targeted mid-2028",
    summary: "A signed engineering-procurement-construction agreement with a Japanese–Indonesian consortium fixes scope, price and schedule, targeting commercial operation in June 2028.",
    date: "2026-09-10", stage: "CONTRACTED", stageConf: 0.94, invBn: 1900, project: "Ulubelu 5", capacity: "55 MW", location: "Lampung",
    counterparty: "Japanese-led EPC consortium", plannedStart: "2026-10-15", expectedCompletion: "2028-06-30", targetYear: 2028,
    source: "IDX Company Disclosure", url: "https://www.idx.co.id/en/listed-companies/company-profiles/", tier: 1, claim: "FACT",
    evidenceText: "The disclosure confirms an EPC agreement for Ulubelu 5 (55 MW) with mobilisation from October 2026 and commercial operation targeted for June 2028.",
    extractionConf: 0.95, impact: "Contracted 55 MW renewable addition with a documented schedule that completes two and a half years before the 2030 horizon.",
    mapping: { goal: 7, target: "7.2", rel: "DIRECT", evidence: 94, confidence: 0.93, reasoning: "Signed EPC scope, named capacity, price and schedule constitute direct documented evidence of renewable-energy capacity being added." },
    secondary: { goal: 13, target: "13.2", rel: "INDIRECT", evidence: 71, confidence: 0.7, reasoning: "Geothermal generation displaces grid fossil capacity, contributing indirectly to climate-measure integration in the energy system." },
    market: 2.9,
  },

  /* ---- BREN (SDG 7.2) ---- */
  {
    ticker: "BREN", type: "FINANCING", title: "Barito Renewables reaches financing close for Ijen geothermal unit expansion",
    summary: "A consortium of lenders commits project financing for the second development unit at the Ijen geothermal complex in East Java.",
    date: "2026-02-20", stage: "COMMITTED", stageConf: 0.88, invBn: 4200, project: "Ijen Unit 2", capacity: "70 MW (planned)", location: "East Java", counterparty: "Lender consortium", plannedStart: "2026-06-01",
    source: "Katadata", url: "https://katadata.co.id/energi/bren-ijen-financing-close", tier: 2, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "People familiar with the transaction confirmed financing documents were executed in February, with drawdowns tied to construction milestones.",
    extractionConf: 0.83, impact: "Financing close de-risks delivery of roughly 70 MW of new geothermal capacity.",
    mapping: { goal: 7, target: "7.2", rel: "DIRECT", evidence: 80, confidence: 0.82, reasoning: "Documented financing execution for a named geothermal expansion is committed-capital evidence for renewable generation." },
    market: 1.6,
  },
  {
    ticker: "BREN", type: "PROJECT", title: "Ijen Unit 2 site works begin; Barito Renewables targets commissioning before 2029",
    summary: "Civil works and well-pad preparation are underway at Ijen Unit 2, with the company reiterating a commissioning target ahead of 2029.",
    date: "2026-08-25", stage: "EXECUTING", stageConf: 0.9, invBn: 4200, project: "Ijen Unit 2", capacity: "70 MW", location: "East Java", plannedStart: "2026-06-01", expectedCompletion: "2028-12-31", targetYear: 2028,
    source: "Petromindo", url: "https://www.petromindo.com/news/ijen-unit-2-site-works", tier: 3, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "Site photography and contractor mobilisation records indicate civil works on Unit 2 began in August, consistent with the company's construction schedule.",
    extractionConf: 0.87, impact: "Physical execution underway on 70 MW of geothermal capacity with ~27 months of post-completion headroom to 2030.",
    mapping: { goal: 7, target: "7.2", rel: "DIRECT", evidence: 91, confidence: 0.89, reasoning: "Observed site works on a named geothermal unit are direct, current execution evidence for renewable capacity." },
    market: 2.2,
  },

  /* ---- ADRO (SDG 7.2 + 14.2) ---- */
  {
    ticker: "ADRO", type: "PROJECT", title: "Alamtri starts construction of 50 MWp captive solar facility for Kalimantan operations",
    summary: "Construction has started on a 50 MWp solar plant supplying the group's Kalimantan operations, replacing diesel generation across remote sites.",
    date: "2026-09-02", stage: "EXECUTING", stageConf: 0.91, invBn: 950, project: "Kalimantan captive solar", capacity: "50 MWp", location: "South Kalimantan", plannedStart: "2026-08-01", expectedCompletion: "2027-09-30", targetYear: 2027,
    source: "CNBC Indonesia", url: "https://www.cnbcindonesia.com/market/alamtri-solar-kalimantan", tier: 2, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "A company spokesperson confirmed piles and mounting structures are being installed, with first power targeted for the second half of 2027.",
    extractionConf: 0.89, impact: "Captive renewable build cuts diesel dependence at mine sites; completion runway of ~39 months to the 2030 horizon.",
    mapping: { goal: 7, target: "7.2", rel: "DIRECT", evidence: 88, confidence: 0.88, reasoning: "Documented construction of solar generation with stated capacity is direct evidence of renewable-energy addition." },
    market: 1.8,
  },
  {
    ticker: "ADRO", type: "PROJECT", title: "Alamtri funds 1,200 ha mangrove restoration programme across coastal South Kalimantan",
    summary: "A multi-year coastal restoration facility funds planting and community stewardship across 1,200 hectares of degraded mangrove belts.",
    date: "2026-08-04", stage: "EXECUTING", stageConf: 0.8, invBn: 120, project: "Coastal mangrove restoration", location: "South Kalimantan", expectedCompletion: "2029-12-31", targetYear: 2029,
    source: "Kontan", url: "https://industri.kontan.co.id/news/alamtri-mangrove-program", tier: 2, claim: "COMPANY_CLAIM",
    evidenceText: "The company said planting covering roughly 380 hectares has been completed with village cooperatives, from a 1,200-hectare programme envelope.",
    extractionConf: 0.78, impact: "Funded coastal-ecosystem restoration with partial progress already documented.",
    mapping: { goal: 14, target: "14.2", rel: "DIRECT", evidence: 76, confidence: 0.78, reasoning: "Named mangrove restoration with stated area and partial completion evidence corresponds directly to coastal-ecosystem protection." },
    market: 1.1,
  },

  /* ---- PTBA (SDG 7.2 / 13.2 / 15.1) ---- */
  {
    ticker: "PTBA", type: "PROJECT", title: "Bukit Asam studies solar redevelopment of the Ombilin mine area",
    summary: "Internal feasibility work is examining utility-scale solar on rehabilitated Ombilin land; no budget or tender has been documented.",
    date: "2025-12-01", stage: "SIGNAL", stageConf: 0.4, project: "Ombilin solar concept", location: "West Sumatra",
    source: "Petromindo", url: "https://www.petromindo.com/news/ptba-ombilin-solar-study", tier: 3, claim: "ANALYST_INTERPRETATION",
    evidenceText: "Two people briefed on the work said a concept study exists, but the company has not confirmed budget, capacity or schedule.",
    extractionConf: 0.55, impact: "Weak early indication only; tracked for evidence of budget or tender.",
    mapping: { goal: 7, target: "7.2", rel: "ASPIRATIONAL", evidence: 48, confidence: 0.5, reasoning: "An unconfirmed concept study without budget, capacity or schedule is an aspirational signal, not documented execution." },
    market: 1.0,
  },
  {
    ticker: "PTBA", type: "PROJECT", title: "Bukit Asam breaks ground on South Sumatra CCUS pilot at mine-mouth power complex",
    summary: "Ground-breaking marks the start of a carbon-capture pilot intended to test sequestration readiness at the mine-mouth complex.",
    date: "2026-07-30", stage: "EXECUTING", stageConf: 0.86, invBn: 1400, project: "Sumsel CCUS pilot", capacity: "100 ktpa CO2 (pilot)", location: "South Sumatra", plannedStart: "2026-07-01", expectedCompletion: "2029-06-30", targetYear: 2029, counterparty: "Technology partner + ESDM supervision",
    source: "Kementerian ESDM", url: "https://www.esdm.go.id/en/media-center/news-archives", tier: 1, claim: "FACT",
    evidenceText: "The ministry's ceremony record and permit filings confirm pilot construction commenced in July with a 2029 evaluation window.",
    extractionConf: 0.85, impact: "Physical execution begun on Indonesia's flagship CCUS pilot with a defined evaluation horizon.",
    mapping: { goal: 13, target: "13.2", rel: "DIRECT", evidence: 84, confidence: 0.84, reasoning: "A permitted, funded carbon-capture pilot with construction underway is direct evidence of climate-mitigation measures being integrated into operations." },
    secondary: { goal: 9, target: "9.4", rel: "INDIRECT", evidence: 68, confidence: 0.68, reasoning: "Capture infrastructure upgrades an existing industrial asset toward cleaner operation, an indirect retrofit contribution." },
    market: 1.6,
  },
  {
    ticker: "PTBA", type: "PROJECT", title: "Bukit Asam completes 1,900 ha of post-mine land rehabilitation across three sites",
    summary: "The company reports completed rehabilitation across 1,900 hectares, with canopy cover verified by third-party survey.",
    date: "2026-05-12", stage: "MEASURED", stageConf: 0.92, invBn: 210, project: "Post-mine rehabilitation", location: "South Sumatra", counterparty: "Third-party surveyor",
    source: "Company Sustainability Report", url: "https://www.ptba.co.id/sustainability", tier: 1, claim: "FACT",
    evidenceText: "The sustainability report documents 1,900 hectares rehabilitated with independent verification of canopy establishment across three concessions.",
    extractionConf: 0.9, impact: "Outcome-level evidence: stated hectares restored with third-party verification.",
    mapping: { goal: 15, target: "15.1", rel: "DIRECT", evidence: 91, confidence: 0.9, reasoning: "Documented area restored with verification is direct measured evidence of terrestrial-ecosystem restoration." },
    market: 1.2,
  },

  /* ---- MEDC / AKRA (SDG 7.2) ---- */
  {
    ticker: "MEDC", type: "INVESTMENT", title: "Medco commits Rp1.4T 2027 capex envelope toward East Java gas-and-solar integration",
    summary: "Management commits a 2027 capex envelope integrating gas processing with on-site solar generation to cut facility emissions intensity.",
    date: "2026-08-12", stage: "COMMITTED", stageConf: 0.82, invBn: 1400, project: "East Java integration", capacity: "18 MWp solar + gas upgrades", location: "East Java", plannedStart: "2027-01-15", expectedCompletion: "2028-09-30", targetYear: 2028,
    source: "Bisnis Indonesia", url: "https://www.bisnis.com/markets/read/medco-capex-2027", tier: 2, claim: "COMPANY_CLAIM",
    evidenceText: "“We have committed a Rp1.4 trillion envelope for the East Java integration, including 18 MWp of on-site solar,” the CFO said on the earnings call.",
    extractionConf: 0.82, impact: "Committed decarbonisation capex with a named scope and 2027–28 schedule.",
    mapping: { goal: 7, target: "7.2", rel: "DIRECT", evidence: 79, confidence: 0.78, reasoning: "Company-committed capital for named solar capacity is documented investment evidence, though the statement remains a company claim pending contract proof." },
    market: 1.4,
  },
  {
    ticker: "AKRA", type: "LAUNCH", title: "AKRA commissions biofuel blending terminal adjacent to Java Integrated Industrial Port",
    summary: "The terminal enters operation, enabling B40 handling and exports of blended product through the estate's port infrastructure.",
    date: "2026-06-15", stage: "OPERATIONAL", stageConf: 0.95, invBn: 680, project: "Biofuel blending terminal", capacity: "600 kt/yr", location: "Gresik, East Java",
    source: "IDX Company Disclosure", url: "https://www.idx.co.id/en/listed-companies/company-profiles/", tier: 1, claim: "FACT",
    evidenceText: "The June disclosure states the blending terminal commenced operations with 600 kt/yr nominal capacity and first cargoes shipped.",
    extractionConf: 0.93, impact: "Operational biofuel logistics capacity supports the national blending mandate already in force.",
    mapping: { goal: 7, target: "7.2", rel: "DIRECT", evidence: 86, confidence: 0.88, reasoning: "Commissioned blending infrastructure with documented first cargoes is operational-stage evidence enabling higher biofuel shares." },
    market: 1.5,
  },

  /* ---- Financials (SDG 1.4 / 5.a / 8.10) ---- */
  {
    ticker: "BBRI", type: "LAUNCH", title: "BRI disburses Rp41.2T in micro and ultra-micro loans to 6.8M borrowers in H1 2026",
    summary: "First-half reporting shows micro and ultra-micro disbursement reaching 6.8 million borrowers, extending the holding's financial-inclusion footprint.",
    date: "2026-08-28", stage: "MEASURED", stageConf: 0.96, invBn: 41_200, project: "Micro & ultra-micro lending", counterparty: "6.8M borrowers",
    source: "Company Financial Report", url: "https://www.ir-bri.com/financial-information", tier: 1, claim: "FACT",
    evidenceText: "The H1 2026 financial statements disclose Rp41.2T of H1 disbursement across 6.8 million micro and ultra-micro borrowers.",
    extractionConf: 0.96, impact: "Measured-scale financial inclusion: audited disbursement and borrower counts.",
    mapping: { goal: 1, target: "1.4", rel: "DIRECT", evidence: 96, confidence: 0.95, reasoning: "Audited loan disbursement to millions of low-income borrowers is direct measured evidence of expanding access to economic resources." },
    secondary: { goal: 8, target: "8.10", rel: "DIRECT", evidence: 90, confidence: 0.9, reasoning: "The same disclosure evidences expanded access to banking services at measured scale." },
    market: 1.9,
  },
  {
    ticker: "BMRI", type: "FINANCING", title: "Bank Mandiri issues Rp3T sustainability bond earmarked for green and SME portfolios",
    summary: "The five-year sustainability bond was priced with order books multiple times covered; proceeds are earmarked under the bank's sustainability financing framework.",
    date: "2026-09-16", stage: "COMMITTED", stageConf: 0.9, invBn: 3000, project: "Sustainability bond 2026", counterparty: "Institutional investors",
    source: "IDX Company Disclosure", url: "https://www.idx.co.id/en/listed-companies/company-profiles/", tier: 1, claim: "FACT",
    evidenceText: "The offering disclosure documents Rp3.0T raised with proceeds earmarked for eligible green and SME financing under the published framework.",
    extractionConf: 0.9, impact: "Committed capital channelled toward green and SME lending with a published use-of-proceeds framework.",
    mapping: { goal: 8, target: "8.10", rel: "DIRECT", evidence: 88, confidence: 0.88, reasoning: "Documented bond issue with earmarked SME proceeds is direct evidence of expanded financing capacity for underserved segments." },
    secondary: { goal: 13, target: "13.2", rel: "INDIRECT", evidence: 66, confidence: 0.66, reasoning: "Green use-of-proceeds categories contribute indirectly to climate-measure financing." },
    market: 2.4,
  },
  {
    ticker: "BBCA", type: "LAUNCH", title: "BCA rolls out dedicated financing programme for 1,200 women-led SMEs across 12 provinces",
    summary: "The programme pairs working-capital lines with business mentoring; enrolment reached 740 enterprises one quarter after launch.",
    date: "2026-07-14", stage: "EXECUTING", stageConf: 0.87, invBn: 850, project: "Women-led SME financing", counterparty: "1,200 target enterprises",
    source: "Katadata", url: "https://katadata.co.id/finansial/bca-women-sme-program", tier: 2, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "Programme documents verified with participating chambers show 740 women-led enterprises enrolled against a 1,200 target, with Rp510B disbursed to date.",
    extractionConf: 0.84, impact: "Executing financial-access programme with interim enrolment evidence.",
    mapping: { goal: 5, target: "5.a", rel: "DIRECT", evidence: 85, confidence: 0.84, reasoning: "A running programme expanding women's access to credit with verified enrolment is direct evidence toward equal economic-resource rights." },
    secondary: { goal: 8, target: "8.10", rel: "DIRECT", evidence: 80, confidence: 0.8, reasoning: "Disbursed working-capital lines document expanded financial-service access." },
    market: 1.3,
  },

  /* ---- Technology / connectivity (SDG 9.c / 11.6 / 4.4) ---- */
  {
    ticker: "GOTO", type: "PROJECT", title: "GoTo expands electric two-wheeler fleet to 10,000 units with battery-swap network across Jabodetabek",
    summary: "The electrification programme scales the EV fleet with a swap network, targeting completion of the 10,000-unit rollout by end-2027.",
    date: "2026-09-21", stage: "EXECUTING", stageConf: 0.9, invBn: 1150, project: "Electric 2W fleet", capacity: "10,000 units / 240 swap stations", location: "Jabodetabek", counterparty: "Battery-swap operator", expectedCompletion: "2027-12-31", targetYear: 2027,
    source: "Bloomberg Technoz", url: "https://www.bloombergtechnoz.com/tech/goto-ev-fleet-expansion", tier: 2, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "Deployment records indicate 6,400 electric units are live against the 10,000-unit target, with swap stations operating across 240 sites.",
    extractionConf: 0.88, impact: "Executing urban electric-mobility buildout with interim unit counts documented.",
    mapping: { goal: 11, target: "11.6", rel: "DIRECT", evidence: 87, confidence: 0.86, reasoning: "Documented EV fleet deployment directly reduces urban tailpipe emissions, mapping to city environmental-impact reduction." },
    market: 2.6,
  },
  {
    ticker: "TLKM", type: "PROJECT", title: "Telkom breaks ground on renewable-powered NeutraDC hyperscale campus in Batam",
    summary: "Phase one of the data-center campus includes a dedicated renewable supply arrangement, with energisation targeted for Q1 2028.",
    date: "2026-08-18", stage: "EXECUTING", stageConf: 0.92, invBn: 5800, project: "NeutraDC Batam campus", capacity: "51 MW IT load (phase 1)", location: "Batam", plannedStart: "2026-08-01", expectedCompletion: "2028-03-31", targetYear: 2028,
    source: "Bisnis Indonesia", url: "https://www.bisnis.com/markets/read/telkom-neutradc-batam", tier: 2, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "Tender awards and site-mobilisation filings confirm phase-one construction of the 51 MW campus with a contracted renewable supply arrangement.",
    extractionConf: 0.9, impact: "Executing digital-infrastructure build with a documented renewable-energy supply component.",
    mapping: { goal: 9, target: "9.1", rel: "DIRECT", evidence: 92, confidence: 0.9, reasoning: "Funded, contracted and physically started digital infrastructure with documented capacity is direct evidence for resilient-infrastructure buildout." },
    secondary: { goal: 7, target: "7.2", rel: "INDIRECT", evidence: 74, confidence: 0.72, reasoning: "A dedicated renewable-supply arrangement indirectly supports renewable generation demand." },
    market: 2.1,
  },
  {
    ticker: "TLKM", type: "LAUNCH", title: "Telkom's digital-talent academy reports 52,000 graduates since 2024 cohort launch",
    summary: "The academy discloses cumulative graduate counts and placement rates across four cohorts, with employer-verified outcomes.",
    date: "2026-08-02", stage: "MEASURED", stageConf: 0.9, project: "Digital talent academy", capacity: "52,000 graduates", counterparty: "Employer partners",
    source: "Company Sustainability Report", url: "https://www.telkom.co.id/sustainability-report", tier: 1, claim: "FACT",
    evidenceText: "The sustainability report lists 52,000 cumulative graduates with a 71% verified placement rate within six months of completion.",
    extractionConf: 0.88, impact: "Measured skills outcome with verified placement statistics.",
    mapping: { goal: 4, target: "4.4", rel: "DIRECT", evidence: 89, confidence: 0.88, reasoning: "Reported graduate and placement counts are measured evidence of relevant-skills provision for employment." },
    market: 1.2,
  },
  {
    ticker: "ISAT", type: "PROJECT", title: "Indosat lights up fixed-wireless access across 400 rural villages in eastern Indonesia",
    summary: "The first rollout tranche brings fixed-wireless broadband to 400 villages, part of a 1,200-village universal-access programme.",
    date: "2026-09-05", stage: "EXECUTING", stageConf: 0.89, invBn: 900, project: "Rural FWA programme", capacity: "400 of 1,200 villages", location: "NTT / Maluku / Papua", expectedCompletion: "2028-12-31", targetYear: 2028,
    source: "Kontan", url: "https://telekomunikasi.kontan.co.id/news/isat-rural-fwa", tier: 2, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "Village-level activation logs reviewed by Kontan show 400 sites carrying live traffic, one third of the stated 1,200-village programme.",
    extractionConf: 0.86, impact: "Executing rural-connectivity expansion with verifiable site counts and a 2028 programme end-date.",
    mapping: { goal: 9, target: "9.c", rel: "DIRECT", evidence: 85, confidence: 0.85, reasoning: "Documented live broadband sites in underserved villages directly evidence expanding internet access." },
    secondary: { goal: 10, target: "10.2", rel: "INDIRECT", evidence: 70, confidence: 0.7, reasoning: "Rural connectivity indirectly supports economic inclusion of remote communities." },
    market: 1.7,
  },
  {
    ticker: "EXCL", type: "PROJECT", title: "XLSMART weighs Rp2T network-modernisation package focused on eastern Indonesia coverage",
    summary: "Management says a modernisation package is under evaluation, with a decision expected alongside FY26 results; no tender or budget is documented.",
    date: "2026-09-24", stage: "INTENT", stageConf: 0.58, invBn: 2000, project: "Eastern network modernisation", location: "Eastern Indonesia",
    source: "CNBC Indonesia", url: "https://www.cnbcindonesia.com/tech/xlsmart-modernisation-plan", tier: 2, claim: "COMPANY_CLAIM",
    evidenceText: "“We are evaluating a package of up to Rp2 trillion, weighted to eastern coverage,” the CEO said, without confirming timing or vendors.",
    extractionConf: 0.68, impact: "Stated intention only; monitoring for budget approval or tender evidence.",
    mapping: { goal: 9, target: "9.c", rel: "ASPIRATIONAL", evidence: 61, confidence: 0.62, reasoning: "A stated intention without budget, tender or schedule is aspirational evidence for expanded internet access." },
    market: 1.2,
  },
  {
    ticker: "TOWR", type: "CONTRACT", title: "Sarana Menara signs 1,800-tower rural coverage agreement with MNO consortium",
    summary: "The build-to-suit agreement covers 1,800 rural sites across 2026-27 with defined delivery milestones and tenancy commitments.",
    date: "2026-08-30", stage: "CONTRACTED", stageConf: 0.93, invBn: 2400, project: "Rural build-to-suit", capacity: "1,800 towers", location: "Nationwide (rural)", counterparty: "MNO consortium", plannedStart: "2026-10-01", expectedCompletion: "2027-11-30", targetYear: 2027,
    source: "IDX Company Disclosure", url: "https://www.idx.co.id/en/listed-companies/company-profiles/", tier: 1, claim: "FACT",
    evidenceText: "The disclosure confirms a signed build-to-suit agreement for 1,800 rural sites with milestone schedules and take-or-pay tenancy terms.",
    extractionConf: 0.92, impact: "Contracted rural-coverage infrastructure with committed counterparties and a 2027 completion target.",
    mapping: { goal: 9, target: "9.c", rel: "DIRECT", evidence: 89, confidence: 0.9, reasoning: "A signed agreement for named rural-coverage infrastructure is direct contracted evidence toward universal internet access." },
    market: 2.0,
  },

  /* ---- Industrials (SDG 9.2 / 9.4) ---- */
  {
    ticker: "ASII", type: "CONTRACT", title: "Astra group awards Rp4.6T in construction and equipment contracts for Batang EV-component plant",
    summary: "Awarded contracts cover site works and production equipment for the Batang industrial-estate facility, with completion planned for September 2028.",
    date: "2026-09-08", stage: "CONTRACTED", stageConf: 0.94, invBn: 4600, project: "Batang EV-component plant", capacity: "Phase 1: 120k unit equivalents", location: "Batang, Central Java", counterparty: "EPC + equipment vendors", plannedStart: "2026-11-01", expectedCompletion: "2028-09-30", targetYear: 2028,
    source: "IDX Company Disclosure", url: "https://www.idx.co.id/en/listed-companies/company-profiles/", tier: 1, claim: "FACT",
    evidenceText: "Award letters lodged with the exchange confirm Rp4.6T of contracts across construction and equipment packages, with a September 2028 completion schedule.",
    extractionConf: 0.94, impact: "Contracted advanced-manufacturing capacity with ~27 months of post-completion headroom to 2030.",
    mapping: { goal: 9, target: "9.2", rel: "DIRECT", evidence: 93, confidence: 0.92, reasoning: "Contracted industrial plant with named investment and schedule is direct evidence of industrialization activity." },
    secondary: { goal: 9, target: "9.4", rel: "DIRECT", evidence: 78, confidence: 0.76, reasoning: "The EV-component scope introduces cleaner-technology manufacturing capability." },
    market: 2.7,
  },
  {
    ticker: "UNTR", type: "PROJECT", title: "United Tractors deploys 40 electric haul trucks across customer nickel sites",
    summary: "The first tranche of battery-electric haul units is operating at customer sites, with telemetry shared under a performance-agreement framework.",
    date: "2026-07-22", stage: "EXECUTING", stageConf: 0.87, invBn: 780, project: "Electric haul fleet", capacity: "40 units (tranche 1)", location: "Sulawesi / Maluku",
    source: "Kontan", url: "https://industri.kontan.co.id/news/untr-electric-trucks", tier: 2, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "Site verification with two operating mine contractors confirms 40 battery-electric haul trucks in service under UNTR performance agreements.",
    extractionConf: 0.83, impact: "Executing clean-technology deployment in heavy industry with operating units verified.",
    mapping: { goal: 9, target: "9.4", rel: "DIRECT", evidence: 81, confidence: 0.8, reasoning: "Deployed electric heavy equipment is direct upgrading evidence toward clean technology adoption in industry." },
    market: 1.5,
  },

  /* ---- Basic materials (SDG 7.2 / 9.4) ---- */
  {
    ticker: "AMMN", type: "PROJECT", title: "Amman commissions phase one of 400 MW captive solar-and-gas hybrid for the Batu Hijau expansion",
    summary: "Phase one of the captive hybrid complex is delivering power to concentrator expansion works; full build-out is scheduled through 2029.",
    date: "2026-09-12", stage: "EXECUTING", stageConf: 0.9, invBn: 6100, project: "Captive hybrid power", capacity: "400 MW (85 MW phase 1)", location: "West Sumbawa", expectedCompletion: "2029-12-31", targetYear: 2029,
    source: "Bisnis Indonesia", url: "https://www.bisnis.com/markets/read/ammn-hybrid-power", tier: 2, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "Commissioning certificates for the 85 MW first phase were sighted, with the company reiterating staged delivery through 2029.",
    extractionConf: 0.87, impact: "Executing renewable-integrated power build; phase-one operation documented, full completion in 2029 leaves limited-but-real headroom.",
    mapping: { goal: 7, target: "7.2", rel: "DIRECT", evidence: 82, confidence: 0.82, reasoning: "A commissioned first phase of named solar capacity is direct execution evidence of renewable generation." },
    market: 1.9,
  },
  {
    ticker: "ANTM", type: "INVESTMENT", title: "Antam commits Rp900B to battery-grade nickel-sulfate plant upgrade at Kolaka",
    summary: "Board minutes approve an upgrade converting intermediate output to battery-grade sulfate, with works planned across 2027.",
    date: "2026-08-05", stage: "COMMITTED", stageConf: 0.8, invBn: 900, project: "Nickel sulfate upgrade", location: "Kolaka, Southeast Sulawesi", plannedStart: "2027-02-01", expectedCompletion: "2028-06-30", targetYear: 2028,
    source: "Kontan", url: "https://industri.kontan.co.id/news/antam-sulfate-upgrade", tier: 2, claim: "COMPANY_CLAIM",
    evidenceText: "The company confirmed board approval of the Rp900B upgrade, with engineering procurement scheduled to open in early 2027.",
    extractionConf: 0.81, impact: "Committed downstream-processing upgrade aligned with battery supply-chain requirements.",
    mapping: { goal: 9, target: "9.4", rel: "DIRECT", evidence: 76, confidence: 0.76, reasoning: "Approved funding for a named process upgrade is documented commitment evidence for industrial modernisation." },
    market: 1.3,
  },
  {
    ticker: "INCO", type: "LAUNCH", title: "Vale Indonesia commissions 100% renewable-powered pilot line at Pomalaa",
    summary: "The pilot processing line is operating on dedicated hydro supply, validating lower-carbon production routes ahead of full-plant decisions.",
    date: "2026-06-28", stage: "OPERATIONAL", stageConf: 0.92, invBn: 520, project: "Pomalaa renewable pilot line", capacity: "pilot scale", location: "Pomalaa, Southeast Sulawesi",
    source: "Petromindo", url: "https://www.petromindo.com/news/vale-pomalaa-pilot", tier: 3, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "Operating records confirmed with site management show the pilot line running since late June on dedicated hydro offtake.",
    extractionConf: 0.84, impact: "Operational clean-power processing pilot with running-hours evidence.",
    mapping: { goal: 9, target: "9.4", rel: "DIRECT", evidence: 88, confidence: 0.86, reasoning: "An operating low-carbon production line is direct operational evidence of sustainable-process upgrading." },
    secondary: { goal: 7, target: "7.2", rel: "INDIRECT", evidence: 72, confidence: 0.7, reasoning: "Dedicated hydro offtake indirectly supports renewable generation demand." },
    market: 1.6,
  },
  {
    ticker: "SMGR", type: "PROJECT", title: "Semen Indonesia starts clinker decarbonisation retrofit and waste co-processing line at Tuban",
    summary: "The retrofit package adds alternative-fuel feeding and process optimisation at Tuban, targeting a meaningful cut in clinker factor by 2028.",
    date: "2026-08-29", stage: "EXECUTING", stageConf: 0.86, invBn: 1750, project: "Tuban decarbonisation retrofit", location: "Tuban, East Java", plannedStart: "2026-08-15", expectedCompletion: "2028-12-31", targetYear: 2028,
    source: "Bisnis Indonesia", url: "https://www.bisnis.com/markets/read/smgr-tuban-retrofit", tier: 2, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "Contractor mobilisation at Tuban confirmed in August; the company states the alternative-fuel line is part of a committed decarbonisation package.",
    extractionConf: 0.84, impact: "Executing industrial retrofit with documented scope and 2028 completion target.",
    mapping: { goal: 9, target: "9.4", rel: "DIRECT", evidence: 83, confidence: 0.82, reasoning: "Funded retrofit works underway are direct evidence of industrial upgrading toward cleaner production." },
    secondary: { goal: 12, target: "12.4", rel: "INDIRECT", evidence: 70, confidence: 0.68, reasoning: "Waste co-processing diverts municipal and industrial waste streams, an indirect sound-management contribution." },
    market: 1.4,
  },
  {
    ticker: "BRPT", type: "PROJECT", title: "Barito Pacific explores a Rp5T green-chemicals expansion alongside geothermal-linked utilities",
    summary: "Management confirms concept work on a green-chemicals expansion; no budget approval, contract or schedule is documented.",
    date: "2026-09-26", stage: "INTENT", stageConf: 0.55, invBn: 5000, project: "Green chemicals concept", location: "Banten",
    source: "Bloomberg Technoz", url: "https://www.bloombergtechnoz.com/companies/brpt-green-chemicals", tier: 2, claim: "COMPANY_CLAIM",
    evidenceText: "“Concept work is underway on an expansion of up to Rp5 trillion,” the director said, stressing no investment decision has been taken.",
    extractionConf: 0.66, impact: "Exploration-stage intention; treated as early pipeline only.",
    mapping: { goal: 9, target: "9.4", rel: "ASPIRATIONAL", evidence: 58, confidence: 0.58, reasoning: "An explicitly undecided concept is aspirational evidence; no documented implementation exists." },
    market: 1.4,
  },

  /* ---- Water (SDG 6.1 / 6.3) ---- */
  {
    ticker: "WIKA", type: "PROJECT", title: "WIKA shortlisted for West Java water-supply (SPAM) tender package",
    summary: "The provincial tender process lists WIKA among shortlisted bidders for regional water-supply development; no award is documented at this stage.",
    date: "2026-05-05", stage: "INTENT", stageConf: 0.6, project: "West Java SPAM", location: "West Java",
    source: "Kontan", url: "https://industri.kontan.co.id/news/wika-spam-shortlist", tier: 2, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "Tender documents published by the procurement committee list WIKA among three shortlisted consortium leads.",
    extractionConf: 0.72, impact: "Pipeline positioning ahead of a formal award decision.",
    mapping: { goal: 6, target: "6.1", rel: "ASPIRATIONAL", evidence: 60, confidence: 0.62, reasoning: "Shortlist status signals probable involvement but is not contracted delivery evidence." },
    market: 1.1,
  },
  {
    ticker: "WIKA", type: "CONTRACT", title: "WIKA wins Rp1.1T contract to build a 120 MLD water-treatment plant in West Java",
    summary: "The signed EPC contract covers intake, treatment and distribution works, with commissioning scheduled for mid-2028.",
    date: "2026-09-17", stage: "CONTRACTED", stageConf: 0.93, invBn: 1100, project: "West Java SPAM WTP", capacity: "120 MLD", location: "West Java", counterparty: "Provincial water utility", plannedStart: "2026-10-20", expectedCompletion: "2028-06-30", targetYear: 2028,
    source: "Kementerian PUPR", url: "https://www.pu.go.id/berita", tier: 1, claim: "FACT",
    evidenceText: "The ministry's award notice confirms the signed EPC contract for a 120 MLD plant with commissioning due June 2028.",
    extractionConf: 0.93, impact: "Contracted drinking-water capacity with a documented schedule completing ~30 months before 2030.",
    mapping: { goal: 6, target: "6.1", rel: "DIRECT", evidence: 91, confidence: 0.91, reasoning: "A signed contract for named drinking-water capacity is direct evidence of expanding safe-water access infrastructure." },
    secondary: { goal: 6, target: "6.3", rel: "INDIRECT", evidence: 72, confidence: 0.7, reasoning: "Treatment scope improves raw-water quality handling, an indirect water-quality contribution." },
    market: 2.3,
  },
  {
    ticker: "PTPP", type: "CONTRACT", title: "PP signs Rp980B package for Mandalika water and sanitation grid expansion",
    summary: "The package bundles distribution mains, wastewater collection and reuse systems for the special economic zone.",
    date: "2026-08-21", stage: "CONTRACTED", stageConf: 0.9, invBn: 980, project: "Mandalika water & sanitation grid", capacity: "85 MLD-equivalent network", location: "Mandalika, NTB", counterparty: "Tourism development authority", plannedStart: "2026-09-25", expectedCompletion: "2028-03-31", targetYear: 2028,
    source: "IDX Company Disclosure", url: "https://www.idx.co.id/en/listed-companies/company-profiles/", tier: 1, claim: "FACT",
    evidenceText: "The disclosure confirms the signed package including wastewater collection and reclaimed-water reuse systems, with a March 2028 completion schedule.",
    extractionConf: 0.89, impact: "Contracted sanitation and wastewater infrastructure inside a national priority destination.",
    mapping: { goal: 6, target: "6.3", rel: "DIRECT", evidence: 85, confidence: 0.85, reasoning: "A signed contract including wastewater collection and reuse is direct evidence toward improved water quality and safe reuse." },
    secondary: { goal: 17, target: "17.17", rel: "INDIRECT", evidence: 64, confidence: 0.64, reasoning: "Delivery under a public authority framework reflects public-private implementation partnership." },
    market: 1.8,
  },

  /* ---- Cities & transport (SDG 9.1 / 11.2 / 11.3) ---- */
  {
    ticker: "JSMR", type: "PROJECT", title: "Jasa Marga pilots solar-powered smart toll corridor along Trans-Java sections",
    summary: "Roadside solar arrays and smart-corridor systems are being installed across three operating sections as a replicable pilot.",
    date: "2026-09-19", stage: "EXECUTING", stageConf: 0.83, invBn: 640, project: "Solar smart-toll pilot", capacity: "12 MW roadside + corridor systems", location: "Trans-Java", expectedCompletion: "2027-08-31", targetYear: 2027,
    source: "CNBC Indonesia", url: "https://www.cnbcindonesia.com/news/jsmr-solar-toll", tier: 2, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "Installation works at three gantries and roadside arrays were confirmed with the corridor operator during a site visit.",
    extractionConf: 0.82, impact: "Executing sustainable-infrastructure pilot on operating toll assets.",
    mapping: { goal: 9, target: "9.1", rel: "DIRECT", evidence: 78, confidence: 0.78, reasoning: "Documented installation of renewable-powered corridor systems is direct resilient-infrastructure upgrading evidence." },
    market: 1.4,
  },
  {
    ticker: "DMAS", type: "PROJECT", title: "Puradelta breaks ground on a 220-hectare green industrial zone with circular utilities in GIIC Kota Deltamas",
    summary: "The new zone mandates on-site renewables, shared wastewater treatment and reclaimed-water loops for incoming manufacturers.",
    date: "2026-08-11", stage: "EXECUTING", stageConf: 0.85, invBn: 3100, project: "Kota Deltamas green zone", capacity: "220 ha", location: "Bekasi, West Java", plannedStart: "2026-08-01", expectedCompletion: "2029-09-30", targetYear: 2029,
    source: "Kontan", url: "https://industri.kontan.co.id/news/dmas-green-zone", tier: 2, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "Earthworks for the first 90-hectare tranche are underway; marketing documents mandate renewable-ready rooftops and shared treatment infrastructure.",
    extractionConf: 0.83, impact: "Executing sustainable-industrial land development with mandated green utilities.",
    mapping: { goal: 9, target: "9.2", rel: "DIRECT", evidence: 84, confidence: 0.82, reasoning: "Physically started industrial-zone development with documented scale directly evidences industrialisation activity with sustainable utilities." },
    market: 1.6,
  },
  {
    ticker: "CTRA", type: "LAUNCH", title: "Ciputra launches first net-zero-ready township district with 42 MW rooftop-solar masterplan",
    summary: "The district's first phase opens with solar-ready rooftops and a staged district-energy plan; phase-one handover is underway.",
    date: "2026-07-30", stage: "EXECUTING", stageConf: 0.82, invBn: 2200, project: "Net-zero-ready district", capacity: "42 MW rooftop masterplan", location: "Greater Jakarta", expectedCompletion: "2028-12-31", targetYear: 2028,
    source: "Bisnis Indonesia", url: "https://www.bisnis.com/properti/read/ctra-net-zero-district", tier: 2, claim: "COMPANY_CLAIM",
    evidenceText: "The company reports phase-one sales handover in progress and confirms the district energy plan is embedded in cluster specifications.",
    extractionConf: 0.8, impact: "Executing sustainable urban development with documented phase-one delivery.",
    mapping: { goal: 11, target: "11.3", rel: "DIRECT", evidence: 81, confidence: 0.8, reasoning: "Documented delivery of a district designed around resource-efficient energy planning is direct sustainable-urbanisation evidence; solar claims remain company statements pending commissioning data." },
    market: 1.5,
  },
  {
    ticker: "BIRD", type: "PROJECT", title: "Blue Bird adds 1,500 electric vehicles to its Jakarta fleet; three charging depots now live",
    summary: "The EV programme scales to 1,500 units with purpose-built charging depots, targeting full deployment by mid-2027.",
    date: "2026-09-23", stage: "EXECUTING", stageConf: 0.9, invBn: 870, project: "EV taxi programme", capacity: "1,500 units / 3 depots", location: "Jakarta", expectedCompletion: "2027-06-30", targetYear: 2027,
    source: "IDX Company Disclosure", url: "https://www.idx.co.id/en/listed-companies/company-profiles/", tier: 1, claim: "FACT",
    evidenceText: "The September disclosure states 1,050 of 1,500 ordered units are in service and three charging depots are operational.",
    extractionConf: 0.9, impact: "Executing sustainable-transport rollout with interim deployment counts disclosed.",
    mapping: { goal: 11, target: "11.2", rel: "DIRECT", evidence: 88, confidence: 0.88, reasoning: "Documented EV fleet growth in public-transport service is direct evidence of sustainable-transport expansion." },
    market: 2.8,
  },

  /* ---- Consumption (SDG 12.5 / 2.4) ---- */
  {
    ticker: "UNVR", type: "LAUNCH", title: "Unilever Indonesia opens plastic-waste recycling hub with 30 kt annual capacity in Tangerang",
    summary: "The facility processes post-consumer flexible packaging into feedstock, completing a two-year circular-economy investment programme.",
    date: "2026-08-15", stage: "OPERATIONAL", stageConf: 0.94, invBn: 640, project: "Flexible-packaging recycling hub", capacity: "30 kt/yr", location: "Tangerang, Banten", counterparty: "Waste-aggregator cooperatives",
    source: "Company Press Release", url: "https://www.unilever.co.id/press/", tier: 1, claim: "FACT",
    evidenceText: "The release documents commissioning in August with 30 kt/yr nameplate capacity and first commercial batches shipped to offtakers.",
    extractionConf: 0.92, impact: "Operational circular-economy infrastructure with named throughput capacity.",
    mapping: { goal: 12, target: "12.5", rel: "DIRECT", evidence: 90, confidence: 0.9, reasoning: "A commissioned recycling facility with stated throughput is direct operational evidence of waste reduction through recycling." },
    market: 1.4,
  },
  {
    ticker: "INDF", type: "INVESTMENT", title: "Indofood commits Rp1.2T to regenerative rice sourcing across 45,000 hectares of partner farmland",
    summary: "The five-year programme funds water-saving cultivation and soil-health practices across partner mills in Java and South Sumatra.",
    date: "2026-09-03", stage: "COMMITTED", stageConf: 0.83, invBn: 1200, project: "Regenerative rice programme", capacity: "45,000 ha", location: "Java / South Sumatra", plannedStart: "2027-01-01", expectedCompletion: "2030-06-30", targetYear: 2030, counterparty: "Partner mills & farmer groups",
    source: "Company Sustainability Report", url: "https://www.indofood.com/sustainability", tier: 1, claim: "COMPANY_CLAIM",
    evidenceText: "The report documents a Rp1.2T committed envelope through 2030 with 8,000 hectares enrolled in the first season.",
    extractionConf: 0.84, impact: "Committed multi-year sustainable-agriculture funding with early enrolment evidence and a deadline-aligned horizon.",
    mapping: { goal: 2, target: "2.4", rel: "DIRECT", evidence: 83, confidence: 0.82, reasoning: "Documented committed funding for named resilient-agriculture practices is direct evidence toward sustainable food production." },
    market: 1.3,
  },
  {
    ticker: "CPIN", type: "PROJECT", title: "Charoen Pokphand executes solar-powered aquaculture modernisation at Lampung grow-out sites",
    summary: "The modernisation package installs solar aeration and water-recirculation systems across partner shrimp farms.",
    date: "2026-08-27", stage: "EXECUTING", stageConf: 0.82, invBn: 540, project: "Solar aquaculture modernisation", capacity: "14 MW across sites", location: "Lampung", expectedCompletion: "2027-10-31", targetYear: 2027,
    source: "Kontan", url: "https://investasi.kontan.co.id/news/cpin-lampung-aquaculture", tier: 2, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "Installer records show solar-aeration systems commissioned at 11 of 26 planned sites, with recirculation kits staged for Q4.",
    extractionConf: 0.8, impact: "Executing sustainable-aquaculture upgrades with interim site counts verified.",
    mapping: { goal: 2, target: "2.4", rel: "DIRECT", evidence: 79, confidence: 0.78, reasoning: "Documented installation of resilient production systems in food production is direct evidence toward sustainable agriculture." },
    secondary: { goal: 7, target: "7.2", rel: "INDIRECT", evidence: 68, confidence: 0.66, reasoning: "On-site solar additions indirectly raise renewable energy shares." },
    market: 1.2,
  },

  /* ---- Healthcare (SDG 3.8) ---- */
  {
    ticker: "KLBF", type: "INVESTMENT", title: "Kalbe board approves Rp2.9T capex for biologics manufacturing campus in Cikarang",
    summary: "Board approval allocates funding for a biologics campus intended to localise production of affordable biosimilar therapies.",
    date: "2026-03-10", stage: "COMMITTED", stageConf: 0.87, invBn: 2900, project: "Biologics campus", location: "Cikarang, West Java", plannedStart: "2026-09-01",
    source: "IDX Company Disclosure", url: "https://www.idx.co.id/en/listed-companies/company-profiles/", tier: 1, claim: "FACT",
    evidenceText: "The March disclosure records board approval of Rp2.9T for the biologics campus with site works planned from September 2026.",
    extractionConf: 0.89, impact: "Committed pharmaceutical manufacturing investment targeting affordable-medicine localisation.",
    mapping: { goal: 3, target: "3.8", rel: "DIRECT", evidence: 80, confidence: 0.8, reasoning: "Approved funding for domestic medicine manufacturing is direct commitment evidence toward essential-medicine access." },
    market: 1.4,
  },
  {
    ticker: "KLBF", type: "PROJECT", title: "Kalbe breaks ground on Cikarang biologics campus; first production modules targeted for 2028",
    summary: "Ground works have started on the biologics campus, with two production modules scheduled for completion in October 2028.",
    date: "2026-09-14", stage: "EXECUTING", stageConf: 0.93, invBn: 2900, project: "Biologics campus", capacity: "2 modules (phase 1)", location: "Cikarang, West Java", plannedStart: "2026-09-01", expectedCompletion: "2028-10-31", targetYear: 2028,
    source: "Bisnis Indonesia", url: "https://www.bisnis.com/markets/read/klbf-biologics-groundbreak", tier: 2, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "Ground-breaking records and contractor mobilisation confirm works started in September, consistent with the approved Rp2.9T programme.",
    extractionConf: 0.92, impact: "Executing affordable-medicine manufacturing build with ~26 months of post-completion runway to 2030.",
    mapping: { goal: 3, target: "3.8", rel: "DIRECT", evidence: 93, confidence: 0.92, reasoning: "Physically started pharmaceutical manufacturing capacity with documented schedule is direct execution evidence toward essential-medicine access." },
    market: 2.5,
  },
  {
    ticker: "SILO", type: "EXPANSION", title: "Siloam opens its 11th regional hospital, adding 240 beds across secondary cities in Sumatra",
    summary: "The new facility extends specialist care capacity into an underserved secondary city, with emergency and surgical services operating from day one.",
    date: "2026-07-18", stage: "OPERATIONAL", stageConf: 0.95, invBn: 1100, project: "Regional hospital expansion", capacity: "240 beds", location: "Jambi",
    source: "Katadata", url: "https://katadata.co.id/healthcare/siloam-jambi-opening", tier: 2, claim: "THIRD_PARTY_CLAIM",
    evidenceText: "The hospital opened to patients in July with 240 beds and 14 specialist departments; occupancy reached 38% within eight weeks.",
    extractionConf: 0.88, impact: "Operational healthcare-capacity addition with early utilisation data.",
    mapping: { goal: 3, target: "3.8", rel: "DIRECT", evidence: 87, confidence: 0.86, reasoning: "A newly operating hospital with documented beds and utilisation is direct evidence of expanded essential health-care access." },
    market: 1.3,
  },
  {
    ticker: "SIDO", type: "LAUNCH", title: "Sido Muncul commissions herbal-waste biomass boiler, cutting coal use 60% at the Semarang plant",
    summary: "The biomass system converts production residues into process steam, displacing the majority of coal-fired generation at the facility.",
    date: "2026-08-08", stage: "OPERATIONAL", stageConf: 0.93, invBn: 320, project: "Biomass boiler", capacity: "18 tph steam", location: "Ungaran, Central Java",
    source: "Company Press Release", url: "https://www.sidomuncul.co.id/en/news", tier: 1, claim: "FACT",
    evidenceText: "Commissioning records show the biomass boiler in continuous operation since August, with the company reporting coal consumption down 60% month-on-month.",
    extractionConf: 0.87, impact: "Operational industrial decarbonisation with stated displacement metrics.",
    mapping: { goal: 7, target: "7.2", rel: "DIRECT", evidence: 82, confidence: 0.82, reasoning: "A commissioned biomass energy system displacing fossil fuel is direct operational evidence toward renewable energy share." },
    market: 1.1,
  },
];

/* ------------------------------------------------------------------ */
/* Seeds for price generation                                           */
/* ------------------------------------------------------------------ */

const SECTOR_DRIFT: Record<string, number> = {
  Financials: 0.00035, Technology: 0.0006, Infrastructure: 0.00045,
  Industrials: 0.0005, Energy: 0.00055, "Basic Materials": 0.0004,
  "Properties & Real Estate": 0.00025, "Consumer Non-Cyclicals": 0.00015,
  Healthcare: 0.0005, "Consumer Cyclicals": 0.0003, "Transportation & Logistic": 0.0004,
};

/* ------------------------------------------------------------------ */
/* Main                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  console.log("Wiping existing data…");
  await db.execute(sql`TRUNCATE TABLE
    market_intel_scores, scenario, market_rules,
    signal_snapshots, signal_evidence, research_briefs, signals,
    market_context_snapshots, market_prices, event_sdg_mappings,
    business_events, company_fundamentals, companies,
    sdg_targets, sdg_goals RESTART IDENTITY CASCADE`);

  /* ---- time-versioned BEI market microstructure rules ---- */
  await db.insert(s.marketRules).values([
    { validFrom: "2026-09-28", validUntil: "2027-01-01", priceMin: 1, priceMax: 10, bandLabel: "Rp1–Rp10", araLabel: "Rp1", arbLabel: "Rp1", araPct: null, arbPct: null, sourceNote: BEI_RULE_NOTE },
    { validFrom: "2026-09-28", validUntil: "2027-01-01", priceMin: 10, priceMax: 200, bandLabel: ">Rp10–Rp200", araLabel: "35%", arbLabel: "15%", araPct: 0.35, arbPct: -0.15, sourceNote: BEI_RULE_NOTE },
    { validFrom: "2026-09-28", validUntil: "2027-01-01", priceMin: 200, priceMax: 5000, bandLabel: ">Rp200–Rp5,000", araLabel: "25%", arbLabel: "15%", araPct: 0.25, arbPct: -0.15, sourceNote: BEI_RULE_NOTE },
    { validFrom: "2026-09-28", validUntil: null, priceMin: 5000, priceMax: null, bandLabel: ">Rp5,000", araLabel: "20%", arbLabel: "15%", araPct: 0.2, arbPct: -0.15, sourceNote: BEI_RULE_NOTE },
    /* symmetric bands effective 1 Jan 2027 */
    { validFrom: "2027-01-01", validUntil: null, priceMin: 1, priceMax: 10, bandLabel: "Rp1–Rp10", araLabel: "Rp1", arbLabel: "Rp1", araPct: null, arbPct: null, sourceNote: BEI_RULE_NOTE },
    { validFrom: "2027-01-01", validUntil: null, priceMin: 10, priceMax: 200, bandLabel: ">Rp10–Rp200", araLabel: "35%", arbLabel: "35%", araPct: 0.35, arbPct: -0.35, sourceNote: BEI_RULE_NOTE },
    { validFrom: "2027-01-01", validUntil: null, priceMin: 200, priceMax: 5000, bandLabel: ">Rp200–Rp5,000", araLabel: "25%", arbLabel: "25%", araPct: 0.25, arbPct: -0.25, sourceNote: BEI_RULE_NOTE },
    { validFrom: "2027-01-01", validUntil: null, priceMin: 5000, priceMax: null, bandLabel: ">Rp5,000", araLabel: "20%", arbLabel: "20%", araPct: 0.2, arbPct: -0.2, sourceNote: BEI_RULE_NOTE },
  ]);

  /* ---- 2030 Market & Execution Scenario (context layer) ---- */
  await db.insert(s.scenario).values([
    {
      scenarioYear: 2026, code: "STRESS_PRICE_DISCOVERY", label: "Stress / Price Discovery",
      description: "Internal scenario layer. Monitor drawdowns, abnormal volume, liquidity pressure and resilient fundamentals. Actual data decides whether the scenario is confirmed.",
      observableIndicators: ["Broad drawdowns beyond −15%", "Universe volume ≥1.6× baseline", "Liquidity contraction", "Volatility ≥1.25× baseline"],
      isConfirmedByData: 0, confirmationScore: 0, confirmationLabel: "PENDING_OBSERVATION", updatedOn: iso(SYSTEM_DATE),
    },
    {
      scenarioYear: 2027, code: "EARLY_RECOVERY", label: "Early Recovery / Confirmation",
      description: "Watch for stabilisation, fundamental confirmation and early re-rating. Recovery confirmation requires multiple independent evidence points — never a single up day.",
      observableIndicators: ["Revenue / EPS stabilisation", "Improving volume", "Improving relative strength", "Reduced downside volatility"],
      isConfirmedByData: 0, confirmationScore: 0, confirmationLabel: "PENDING_OBSERVATION", updatedOn: iso(SYSTEM_DATE),
    },
    {
      scenarioYear: 2028, code: "SECOND_STRESS_SCENARIO", label: "Second Stress Window (unverified)",
      description: "Actively test — never assume — whether a new repricing window occurs. Selective resilience, deep-value watch only if data supports it.",
      observableIndicators: ["Market drawdown", "Sector deterioration", "Earnings deterioration", "Unusual volume"],
      isConfirmedByData: 0, confirmationScore: 0, confirmationLabel: "PENDING_OBSERVATION", updatedOn: iso(SYSTEM_DATE),
    },
    {
      scenarioYear: 2029, code: "RECOVERY_RE_RATING", label: "Recovery / Re-rating Window",
      description: "Improving fundamentals, capital redeployment and SDG execution acceleration. Priority concept: execution + recovery confluence.",
      observableIndicators: ["Improving fundamentals", "Improving relative strength", "Projects moving into execution"],
      isConfirmedByData: 0, confirmationScore: 0, confirmationLabel: "PENDING_OBSERVATION", updatedOn: iso(SYSTEM_DATE),
    },
    {
      scenarioYear: 2030, code: "EXECUTION_DEADLINE", label: "Deadline / Execution / Inflation-Stress Scenario",
      description: "Projects approaching completion, measurable SDG outcomes, execution gaps. Under the internal 2030 inflation-stress scenario, pricing-power resilience is tested — never asserted as a prediction.",
      observableIndicators: ["Completion milestones", "Measured outcomes", "Execution gaps", "Pricing-power resilience"],
      isConfirmedByData: 0, confirmationScore: 0, confirmationLabel: "PENDING_OBSERVATION", updatedOn: iso(SYSTEM_DATE),
    },
  ]);

  /* ---- goals & targets ---- */
  const goalIdByN = new Map<number, number>();
  for (const g of GOALS) {
    const [row] = await db
      .insert(s.sdgGoals)
      .values({
        goalNumber: g.n,
        title: g.title,
        shortTitle: g.short,
        color: g.color,
        description: g.desc,
        sourceUrl: `https://sdgs.un.org/goals/goal${g.n}`,
      })
      .returning({ id: s.sdgGoals.id });
    goalIdByN.set(g.n, row.id);
  }

  const targetIdByCode = new Map<string, number>();
  for (const t of TARGETS) {
    const [row] = await db
      .insert(s.sdgTargets)
      .values({
        goalId: goalIdByN.get(t.goal)!,
        targetCode: t.code,
        title: t.title,
        keywords: t.keywords,
        sourceUrl: "https://sdgs.un.org/2030agenda",
      })
      .returning({ id: s.sdgTargets.id });
    targetIdByCode.set(t.code, row.id);
  }
  console.log(`Goals: ${GOALS.length}, targets: ${TARGETS.length}`);

  /* ---- companies ---- */
  const companyIdByTicker = new Map<string, number>();
  for (const c of COMPANIES) {
    const [row] = await db
      .insert(s.companies)
      .values({
        ticker: c.ticker,
        companyName: c.name,
        sector: c.sector,
        industry: c.industry,
        marketCapIdr: c.mcapBn,
        basePrice: c.price,
      })
      .returning({ id: s.companies.id });
    companyIdByTicker.set(c.ticker, row.id);
  }
  console.log(`Companies: ${COMPANIES.length}`);

  /* ---- fundamentals ---- */
  for (const c of COMPANIES) {
    const rng = mulberry32(hashStr(c.ticker + ":fund"));
    await db.insert(s.companyFundamentals).values({
      companyId: companyIdByTicker.get(c.ticker)!,
      reportDate: "2026-06-30",
      epsGrowth: +(rng() * 30 - 4).toFixed(1),
      revenueGrowth: +(rng() * 18 + 2).toFixed(1),
      dividendYield: +(rng() * 5.2).toFixed(2),
      note: "FY26 H1 reported figures via Sectors company report (seed).",
    });
  }

  /* ---- events ---- */
  interface EventRow {
    id: number; ticker: string; seed: EventSeed;
    timingScore: number; timingClass: string;
  }
  const eventRows: EventRow[] = [];

  for (const e of EVENTS) {
    const timing = computeTimingScore({
      stage: e.stage,
      stageConfidence: e.stageConf,
      expectedCompletionDate: e.expectedCompletion ?? null,
      plannedStartDate: e.plannedStart ?? null,
      eventDate: e.date,
      targetYear: e.targetYear ?? null,
    });
    const timingClass = deriveTimingClass(e.stage, e.expectedCompletion ?? null, timing.total);

    const [row] = await db
      .insert(s.businessEvents)
      .values({
        companyId: companyIdByTicker.get(e.ticker)!,
        eventType: e.type,
        title: e.title,
        summary: e.summary,
        eventDate: e.date,
        stage: e.stage,
        stageConfidence: e.stageConf,
        investmentAmountIdr: e.invBn ?? null,
        capacity: e.capacity ?? null,
        location: e.location ?? null,
        counterparty: e.counterparty ?? null,
        project: e.project ?? null,
        plannedStartDate: e.plannedStart ?? null,
        expectedCompletionDate: e.expectedCompletion ?? null,
        targetYear: e.targetYear ?? null,
        timingClass,
        timingScore: timing.total,
        sourceName: e.source,
        sourceUrl: e.url,
        sourceTier: e.tier,
        claimType: e.claim,
        evidenceText: e.evidenceText,
        extractionConfidence: e.extractionConf,
        businessImpact: e.impact,
      })
      .returning({ id: s.businessEvents.id });

    eventRows.push({ id: row.id, ticker: e.ticker, seed: e, timingScore: timing.total, timingClass });

    /* mappings (primary + optional secondary) */
    const m = e.mapping;
    await db.insert(s.eventSdgMappings).values({
      eventId: row.id,
      goalId: goalIdByN.get(m.goal)!,
      targetId: targetIdByCode.get(m.target) ?? null,
      relationshipType: m.rel,
      evidenceScore: m.evidence,
      mappingConfidence: m.confidence,
      reasoning: m.reasoning,
    });
    if (e.secondary) {
      await db.insert(s.eventSdgMappings).values({
        eventId: row.id,
        goalId: goalIdByN.get(e.secondary.goal)!,
        targetId: targetIdByCode.get(e.secondary.target) ?? null,
        relationshipType: e.secondary.rel,
        evidenceScore: e.secondary.evidence,
        mappingConfidence: e.secondary.confidence,
        reasoning: e.secondary.reasoning,
      });
    }
  }
  console.log(`Events: ${eventRows.length}`);

  /* ---- market prices ---- */
  const DAYS = 130;
  const tradingDays = businessDaysBack(SYSTEM_DATE, DAYS);
  const pricesByCompany = new Map<number, { date: string; close: number; volume: number }[]>();

  const priceInserts: (typeof s.marketPrices.$inferInsert)[] = [];

  for (const c of COMPANIES) {
    const id = companyIdByTicker.get(c.ticker)!;
    const rng = mulberry32(hashStr(c.ticker + ":px"));
    const drift = SECTOR_DRIFT[c.sector] ?? 0.0003;
    const returns: number[] = [];
    for (let i = 0; i < DAYS; i++) {
      const shock = (rng() - 0.5) * 2 * 0.016;
      returns.push(drift + shock);
    }
    /* event response: bump returns for ~12 sessions after each event */
    const companyEvents = EVENTS.filter((e) => e.ticker === c.ticker);
    const dayIso = tradingDays.map(iso);
    for (const e of companyEvents) {
      const idx = dayIso.findIndex((d) => d >= e.date);
      if (idx === -1) continue;
      const bump = Math.max(0, e.market - 1) * 0.01;
      for (let k = 0; k < 12 && idx + k < DAYS; k++) {
        returns[idx + k] += bump * Math.pow(0.82, k);
      }
    }
    /* normalise so last close ≈ base price */
    let acc = 0;
    for (const r of returns) acc += r;
    const start = c.price / Math.exp(acc);
    const closes: number[] = [];
    let px = start;
    for (const r of returns) {
      px = px * Math.exp(r);
      closes.push(px);
    }
    const scaleFix = c.price / closes[closes.length - 1];
    for (let i = 0; i < closes.length; i++) closes[i] = closes[i] * scaleFix;

    /* volumes */
    const baseShares = ((c.mcapBn * 1e9) / c.price) * 0.0042;
    const series: { date: string; close: number; volume: number }[] = [];
    for (let i = 0; i < DAYS; i++) {
      let vol = baseShares * (0.7 + rng() * 0.7);
      for (const e of companyEvents) {
        const dEvent = daysBetween(tradingDays[i], parseDate(e.date));
        const ad = Math.abs(dEvent);
        if (ad <= 4) vol *= 1 + (e.market - 1) * Math.pow(0.5, ad / 1.6);
      }
      const row = {
        date: dayIso[i],
        close: Math.round(closes[i]),
        volume: Math.round(vol),
      };
      series.push(row);
      priceInserts.push({ companyId: id, tradingDate: row.date, close: row.close, volume: row.volume });
    }
    pricesByCompany.set(id, series);
  }

  for (let i = 0; i < priceInserts.length; i += 800) {
    await db.insert(s.marketPrices).values(priceInserts.slice(i, i + 800));
  }
  console.log(`Market price rows: ${priceInserts.length}`);

  /* ---- market snapshots ---- */
  interface Snap {
    companyId: number; pc5: number; pc20: number; pc30: number;
    volRatio: number; sectorRet: number; rs: number; mkt: number;
  }
  const rawPc20 = new Map<number, number>();
  const snaps: Snap[] = [];

  const pctChange = (series: { close: number }[], back: number) =>
    (series[series.length - 1].close / series[series.length - 1 - back].close - 1) * 100;

  for (const c of COMPANIES) {
    const id = companyIdByTicker.get(c.ticker)!;
    rawPc20.set(id, pctChange(pricesByCompany.get(id)!, 20));
  }
  const sectorAvg = new Map<string, number>();
  for (const c of COMPANIES) {
    const id = companyIdByTicker.get(c.ticker)!;
    const arr = COMPANIES.filter((x) => x.sector === c.sector).map((x) => rawPc20.get(companyIdByTicker.get(x.ticker)!)!);
    sectorAvg.set(c.sector, arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  for (const c of COMPANIES) {
    const id = companyIdByTicker.get(c.ticker)!;
    const series = pricesByCompany.get(id)!;
    const pc5 = pctChange(series, 5);
    const pc20 = pctChange(series, 20);
    const pc30 = pctChange(series, 30);
    const recent = series.slice(-5).reduce((a, b) => a + b.volume, 0) / 5;
    const base = series.slice(-25, -5).reduce((a, b) => a + b.volume, 0) / 20;
    const volRatio = +(recent / base).toFixed(2);
    const sectorRet = +sectorAvg.get(c.sector)!.toFixed(2);
    const rs = +(pc20 - sectorRet).toFixed(2);
    const mkt = computeMarketScore({ volumeRatio20d: volRatio, priceChange20d: +pc20.toFixed(2), relativeStrength: rs });
    snaps.push({ companyId: id, pc5: +pc5.toFixed(2), pc20: +pc20.toFixed(2), pc30: +pc30.toFixed(2), volRatio, sectorRet, rs, mkt });
    await db.insert(s.marketSnapshots).values({
      companyId: id,
      snapshotDate: iso(SYSTEM_DATE),
      priceChange5d: +pc5.toFixed(2),
      priceChange20d: +pc20.toFixed(2),
      priceChange30d: +pc30.toFixed(2),
      volumeRatio20d: volRatio,
      sectorReturn20d: sectorRet,
      relativeStrength: rs,
      marketSignalScore: mkt,
    });
  }
  /* ---- Market Intelligence Score: 70% Sectors / 20% evidence / 10% SDG ---- */
  const fundamentalsRows = await db.select().from(s.companyFundamentals);
  const fundByCompany = new Map(fundamentalsRows.map((f) => [f.companyId, f]));
  const miByCompany = new Map<number, ReturnType<typeof marketIntelligenceScore>>();
  const marketAvgPc20All = snaps.reduce((a, b) => a + b.pc20, 0) / Math.max(1, snaps.length);

  for (const c of COMPANIES) {
    const cid = companyIdByTicker.get(c.ticker)!;
    const snap = snaps.find((x) => x.companyId === cid)!;
    const fund = fundByCompany.get(cid)!;
    const series = pricesByCompany.get(cid)!;
    const closes = series.map((px) => px.close);
    const highClose = Math.max(...closes);
    const lastClose = closes[closes.length - 1];
    const drawdown = +(((lastClose - highClose) / highClose) * 100).toFixed(1);

    const bestEvent = eventRows
      .filter((x) => x.ticker === c.ticker)
      .sort((a, b) => b.seed.mapping.evidence - a.seed.mapping.evidence)[0];

    const mi = marketIntelligenceScore({
      priceDrawdownPct: drawdown,
      priceChange20d: snap.pc20,
      volumeRatio20d: snap.volRatio,
      relativeStrength: snap.rs,
      revenueGrowth: fund.revenueGrowth,
      epsGrowth: fund.epsGrowth,
      dividendYield: fund.dividendYield,
      sectorReturn20d: snap.sectorRet,
      marketAvg20d: marketAvgPc20All,
      hasEvent: !!bestEvent,
      extractionConfidence: bestEvent?.seed.extractionConf ?? 0,
      sourceTier: bestEvent?.seed.tier ?? 4,
      investmentIdrBn: bestEvent?.seed.invBn ?? null,
      stageIdx: bestEvent ? STAGE_META[bestEvent.seed.stage].idx : 0,
      sdgEvidence: bestEvent?.seed.mapping.evidence ?? 0,
      timingScore: bestEvent?.timingScore ?? 0,
    });
    miByCompany.set(cid, mi);

    const band = priceFloorBandFor(lastClose, iso(SYSTEM_DATE));
    await db.insert(s.marketIntelScores).values({
      companyId: cid,
      computedOn: iso(SYSTEM_DATE),
      methodologyVersion: mi.methodologyVersion,
      priceDislocation: Math.round(mi.priceDislocation),
      volumeAnomaly: Math.round(mi.volumeAnomaly),
      relativePerformance: Math.round(mi.relativePerformance),
      fundamentalContext: Math.round(mi.fundamentalContext),
      marketIndustryContext: Math.round(mi.marketIndustryContext),
      sectorsSubtotal: Math.round(mi.sectorsSubtotal),
      businessEventPts: Math.round(mi.businessEventPts),
      sourceQuality: Math.round(mi.sourceQuality),
      eventMateriality: Math.round(mi.eventMateriality),
      evidenceSubtotal: Math.round(mi.evidenceSubtotal),
      sdgTargetRelevance: Math.round(mi.sdgTargetRelevance),
      executionTiming2030: Math.round(mi.executionTiming2030),
      sdgSubtotal: Math.round(mi.sdgSubtotal),
      totalScore: mi.totalScore,
      marketCondition: mi.marketCondition,
      priceFloorBand: band.band,
      araLabel: band.ara,
      arbLabel: band.arb,
    });
  }

  const snapByCompany = new Map(snaps.map((x) => [x.companyId, x]));

  /* ---- signals ---- */
  const eventsByTicker = new Map<string, EventRow[]>();
  for (const er of eventRows) {
    const list = eventsByTicker.get(er.ticker) ?? [];
    list.push(er);
    eventsByTicker.set(er.ticker, list);
  }

  let signalCount = 0;

  for (const er of eventRows) {
    const e = er.seed;
    if (e.stage === "SIGNAL") continue; // tracked, not signalled
    if (e.mapping.evidence < 55) continue;

    const companyId = companyIdByTicker.get(er.ticker)!;
    const snap = snapByCompany.get(companyId)!;
    const company = COMPANIES.find((c) => c.ticker === er.ticker)!;

    const { strength, rows } = computeConfluence({
      sdgEvidence: e.mapping.evidence,
      businessEvent: Math.round(e.extractionConf * 100),
      stage: e.stage,
      timing: er.timingScore,
      market: snap.mkt,
      relativeStrength: snap.rs,
      sourceTier: e.tier,
    });

    /* signal type */
    const siblingStages = (eventsByTicker.get(er.ticker) ?? [])
      .filter((x) => x.id !== er.id)
      .map((x) => STAGE_META[x.seed.stage].idx);
    const progressedEarlier = siblingStages.some((i) => i < STAGE_META[e.stage].idx && i > 0);
    let signalType: string;
    if (progressedEarlier && STAGE_META[e.stage].idx >= 3) signalType = "Stage Transition";
    else if (e.stage === "MEASURED" || e.stage === "OPERATIONAL") signalType = "SDG Completion Signal";
    else if (e.stage === "EXECUTING") signalType = snap.mkt >= 72 ? "Market Confirmation" : "SDG Execution Signal";
    else if (e.stage === "CONTRACTED") signalType = "SDG Contract Signal";
    else if (e.stage === "COMMITTED") signalType = e.invBn ? "SDG Investment Signal" : "SDG Business Event";
    else if (snap.mkt < 55 && e.mapping.evidence >= 85) signalType = "SDG–Market Divergence";
    else signalType = "SDG Business Event";
    if (snap.mkt < 55 && e.mapping.evidence >= 85 && !progressedEarlier) signalType = "SDG–Market Divergence";

    const compLabel = e.expectedCompletion
      ? iso(parseDate(e.expectedCompletion)).slice(0, 7)
      : e.targetYear
        ? `${e.targetYear}`
        : "undated";
    const headline = `${er.ticker} · ${e.project ?? e.title.split(";")[0]} — ${e.stage} · ${
      e.expectedCompletion ? `completion ${compLabel}` : "no dated completion"
    }`;

    const why: string[] = [];
    if (e.invBn) why.push(`Specific investment disclosed — Rp${e.invBn >= 1000 ? `${(e.invBn / 1000).toFixed(1)}T` : `${e.invBn}B`}`);
    if (e.tier === 1) why.push(`${e.source} evidence (Tier 1)`);
    else why.push(`Corroborated report — ${e.source} (Tier ${e.tier})`);
    if (e.type === "CONTRACT" || e.stage === "CONTRACTED") why.push("Contract / agreement evidence on file");
    if (e.stage === "EXECUTING" || e.stage === "OPERATIONAL" || e.stage === "MEASURED")
      why.push(`Physical progress documented — ${e.stage.toLowerCase()} stage`);
    why.push(`${e.mapping.rel} mapping to SDG ${e.mapping.goal} · Target ${e.mapping.target}`);
    if (e.expectedCompletion) {
      const headroom = (daysBetween(parseDate(e.expectedCompletion), DEADLINE_2030) / 30.44).toFixed(0);
      why.push(`Expected completion ${compLabel} leaves ~${headroom} months of runway to 2030`);
    }
    if (snap.volRatio >= 1.5) why.push(`Volume ${snap.volRatio}× 20-day average`);
    if (snap.rs >= 2) why.push(`+${snap.rs.toFixed(1)}% vs sector over 20 days`);

    const [sig] = await db
      .insert(s.signals)
      .values({
        companyId,
        eventId: er.id,
        goalId: goalIdByN.get(e.mapping.goal)!,
        targetId: targetIdByCode.get(e.mapping.target) ?? null,
        signalType,
        signalStrength: strength,
        sdgEvidenceScore: e.mapping.evidence,
        marketSignalScore: snap.mkt,
        timingScore: er.timingScore,
        executionStage: e.stage,
        timingClass: er.timingClass,
        headline,
        whyFlagged: why,
        detectedAt: e.date,
        status: "ACTIVE",
      })
      .returning({ id: s.signals.id });
    signalCount++;

    const tierLabel = ["", "Tier 1 · official disclosure", "Tier 2 · financial press", "Tier 3 · industry press", "Tier 4 · other"][e.tier];
    for (const r of rows) {
      await db.insert(s.signalEvidence).values({
        signalId: sig.id,
        component: r.component,
        metricName: r.metricName,
        metricValue: r.metricValue,
        benchmarkValue: r.benchmarkValue,
        weight: r.weight,
        contribution: r.contribution,
        explanation: r.explanation,
        sourceReference: r.component === "Source Quality" ? tierLabel : r.component === "Market Context" || r.component === "Relative Performance" ? "Sectors market data (seed series)" : e.url,
      });
    }

    /* replay snapshots */
    const offsets = [90, 60, 45, 20, 10, 0];
    const targetOrd = STAGE_META[e.stage].idx;
    const series = pricesByCompany.get(companyId)!;
    const relevant = (eventsByTicker.get(er.ticker) ?? [])
      .filter((x) => x.seed.date <= e.date)
      .sort((a, b) => (a.seed.date < b.seed.date ? -1 : 1));

    for (const off of offsets) {
      const dDate = new Date(SYSTEM_DATE);
      dDate.setUTCDate(dDate.getUTCDate() - off);
      /* closest trading day ≤ date */
      let chosen = series[0];
      for (const p of series) if (p.date <= iso(dDate)) chosen = p;
      const stageAt = relevant
        .filter((x) => x.seed.date <= iso(dDate))
        .reduce<Stage | null>((acc, x) => {
          if (!acc) return x.seed.stage;
          return STAGE_META[x.seed.stage].idx > STAGE_META[acc].idx ? x.seed.stage : acc;
        }, null);

      const ord = stageAt ? STAGE_META[stageAt].idx : -1;
      const factor = ord < 0 ? 0 : 0.45 + 0.55 * ((ord + 1) / (targetOrd + 1));
      const strengthAt = ord < 0 ? 0 : Math.round(strength * factor);
      const timingAt = ord < 0 ? 0 : Math.max(20, Math.round(er.timingScore * (0.6 + 0.4 * ((ord + 1) / (targetOrd + 1)))));
      const volWin = series.filter((p) => p.date <= chosen!.date).slice(-20);
      const avgVol = volWin.reduce((a, b) => a + b.volume, 0) / volWin.length;
      const dayIdx = series.findIndex((p) => p.date === chosen!.date);
      const vol3 = series.slice(Math.max(0, dayIdx - 2), dayIdx + 1);
      const volRatio = +(vol3.reduce((a, b) => a + b.volume, 0) / vol3.length / avgVol).toFixed(2);

      let note: string;
      if (ord < 0) note = "No qualifying evidence on record — monitoring only.";
      else if (off === 0) note = `${e.stage} confirmed — signal engine emits ${signalType.toLowerCase()} at ${strength}/100.`;
      else {
        const prevEvent = relevant.filter((x) => x.seed.date <= iso(dDate)).pop();
        note = prevEvent
          ? `${prevEvent.seed.stage} evidence on record — ${prevEvent.seed.title.split(";")[0].split(",")[0]}.`
          : `${stageAt} evidence on record; confluence building toward current reading.`;
      }

      await db.insert(s.signalSnapshots).values({
        signalId: sig.id,
        label: off === 0 ? "T" : `T-${off}`,
        snapshotDate: chosen.date,
        signalStrength: strengthAt,
        timingScore: timingAt,
        stage: stageAt ?? "SIGNAL",
        close: chosen.close,
        volumeRatio: volRatio,
        note,
      });
    }

    /* research brief (template-synthesised from verified inputs) */
    const run = e.expectedCompletion
      ? `~${(daysBetween(parseDate(e.expectedCompletion), DEADLINE_2030) / 30.44).toFixed(0)} months`
      : "not quantifiable from the documented evidence";
    const briefRows = rows
      .map((r) => `${r.component} ${r.contribution.toFixed(1)}/${r.weight}`)
      .join(" · ");

    await db.insert(s.researchBriefs).values({
      signalId: sig.id,
      model: "signal-scout-synth 1.0 (deterministic)",
      promptVersion: "1.0.0",
      whatChanged: `${company.name} documented a ${e.type.toLowerCase()} event: “${e.title}”. The event was disclosed on ${e.date} via ${e.source} (${tierLabel}) and has been cross-mapped to SDG ${e.mapping.goal} Target ${e.mapping.target} with an evidence score of ${e.mapping.evidence}/100.`,
      businessEvent: `Type: ${e.type}. ${e.summary} ${e.invBn ? `Disclosed investment: Rp${e.invBn >= 1000 ? (e.invBn / 1000).toFixed(1) + "T" : e.invBn + "B"}. ` : ""}${e.capacity ? `Capacity: ${e.capacity}. ` : ""}${e.location ? `Location: ${e.location}. ` : ""}${e.counterparty ? `Counterparty: ${e.counterparty}. ` : ""}Claim classification: ${e.claim}. Extraction confidence ${(e.extractionConf * 100).toFixed(0)}%.`,
      sdgConnection: `The documented activity carries a ${e.mapping.rel} evidence-based relationship with SDG ${e.mapping.goal} — Target ${e.mapping.target} (“${TARGETS.find((t) => t.code === e.mapping.target)?.title}”). Mapping reasoning: ${e.mapping.reasoning} This is a system-generated evidence mapping, not UN certification or endorsement.`,
      executionStageText: `Classified as ${e.stage} (confidence ${(e.stageConf * 100).toFixed(0)}%). Classification basis: ${e.evidenceText} The classification reflects documented evidence only and distinguishes announcements from executed work.`,
      timing: `2030 Execution Timing Score: ${er.timingScore}/100. System clock as of 28 Sep 2026 shows 1,555 days to the 31 Dec 2030 horizon. ${e.expectedCompletion ? `Expected completion: ${iso(parseDate(e.expectedCompletion))}, leaving ${run} of post-completion runway.` : "No completion date is documented; no timeline has been fabricated."} Timing class: ${er.timingClass} (system-derived heuristic, not an official UN phase).`,
      marketContext: `Sectors snapshot (28 Sep 2026): price ${snap.pc5 >= 0 ? "+" : ""}${snap.pc5}% 5D, ${snap.pc20 >= 0 ? "+" : ""}${snap.pc20}% 20D, ${snap.pc30 >= 0 ? "+" : ""}${snap.pc30}% 30D. Volume is ${snap.volRatio}× the trailing 20-day average. Sector 20D return ${snap.sectorRet >= 0 ? "+" : ""}${snap.sectorRet}%, giving relative strength of ${snap.rs >= 0 ? "+" : ""}${snap.rs}%. Market signal score: ${snap.mkt}/100. ${snap.mkt >= 70 ? "Observable market behaviour appears consistent with the documented event." : snap.mkt >= 50 ? "Market response is moderate relative to the strength of the business evidence." : "Limited market response despite material business evidence — a potential divergence worth investigation."}`,
      signalEvidenceText: `Signal strength ${strength}/100 across seven weighted components: ${briefRows}. All arithmetic is deterministic; no model-generated estimates enter the score.`,
      whyInvestigate: `The event combines ${e.mapping.evidence >= 85 ? "high" : "moderate"} SDG-target evidence (${e.mapping.evidence}/100), a defined execution stage (${e.stage}), and ${e.expectedCompletion ? `a documented timeline completing ${run} ahead of 2030 with a timing class of ${er.timingClass}` : "an undated timeline"}${snap.mkt >= 70 ? ", alongside elevated market activity (score " + snap.mkt + "/100)." : "."} This combination of documented activity, lifecycle position and 2030 runway warrants structured research attention.`,
      investigateNext: [
        e.invBn ? "Financing structure: debt/equity split and cost of capital for the disclosed investment" : "Financing: confirm whether capital has been formally allocated",
        "Milestone verification: check the next documented milestone against the disclosed schedule",
        "Counterparty diligence: assess delivery track record of named counterparties",
        "Peer comparison: identify whether sector peers show similar SDG-target activity (sector momentum)",
        "Fundamental impact: model revenue/cost contribution timing against company disclosures",
      ],
      limitations: `The SDG classification is a system-generated evidence mapping and is not UN certification or endorsement. The 2030 execution windows are product operating heuristics; the UN 2030 Agenda does not prescribe company-level project timelines. Market data in this environment is a seeded demonstration series pending live Sectors API connectivity. This brief is research intelligence, not investment advice, and does not predict future prices.`,
      citations: [
        { label: `${e.source} — event evidence (${e.date})`, url: e.url, tier: e.tier },
        { label: `UN SDG Goal ${e.mapping.goal} — official framework`, url: `https://sdgs.un.org/goals/goal${e.mapping.goal}`, tier: 1 },
        { label: "UN 2030 Agenda — 17 Goals / 169 targets", url: "https://sdgs.un.org/2030agenda", tier: 1 },
      ],
    });
  }
  console.log(`Signals: ${signalCount}`);
  console.log("Seed complete ✔");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
