// Token Radar's model, radar-3: a value model fitted to the snapshot itself,
// with every term kept only if a blind (held-out) test keeps it.
//
// The board ranks every strict pre-token protocol: the watchlist floor plus
// every other protocol that records no token and is not a wrapped, staked
// or bridged product, under the same rule the house watchlist uses. The
// live-token protocols are kept apart as the comparables the model is
// fitted on, and the page accounts for all 758 protocols.
//
// Implied value is fitted, not asserted, in two factors:
//
//   launch value  exp(a + b * ln(tvl))        (OLS size curve, 128 comps)
//   token odds    1 - P(has token | age, TVL, growth)
//                                           (logistic fit, all 758)
//   implied = round(launch value * token odds)
//
// Two terms the first version used are gone, and the model panel says why.
// The joint fit's growth slope is negative (about -0.04 per point) yet the
// old model paid a +0.25 momentum bonus, and the blind test shows the
// growth, age and category terms all make the held-out error worse, so the
// value is the size curve alone. The fitted numbers are printed in the
// panel, never hardcoded, and the dashboard recomputes every row from them.
//
// A farm plan is netted to a verdict. The farmer's expected value is the
// token's implied value times one farmer's share of the farmer pool: the
// pool is 7% of implied value, shared among an estimated 70,000 qualifying
// wallets, so one farmer's share is 0.000001. The cost of farming is the
// gas for every transaction plus 5% a year on the capital locked up. The
// verdict is FARM when the net beats twice the cost, THIN when it beats
// the cost, SKIP when it does not. The detail view shows the arithmetic,
// the dates, and the deposit at which the net reaches zero.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One candidate's held-out error on one fold, and the two-fold mean. */
export interface HeldOutFold {
  fold: string;
  n: number;
  radar3: number;
  v1_formula: number;
  size_category: number;
  joint: number;
  flat: number;
}

export interface HeldOut {
  split: string;
  folds: HeldOutFold[];
  mean: { radar3: number; v1_formula: number; size_category: number; joint: number; flat: number };
}

/** The fitted model, as the dashboard states it. */
export interface FittedModel {
  version: string;
  comps: number;
  intercept: number;
  slope: number;
  r2: number;
  /** The joint fit, kept as a diagnostic: its terms failed the blind test. */
  joint_intercept: number;
  joint_log_tvl: number;
  joint_growth_per_pt: number;
  joint_age_per_year: number;
  joint_r2: number;
  /** The token-odds logistic fit, in raw units, so the page recomputes it. */
  logit_intercept: number;
  logit_age_per_year: number;
  logit_log_tvl: number;
  logit_growth_per_pt: number;
  /** The farmer pool and the wallet count the one-farmer share comes from. */
  farmer_pool: number;
  estimated_wallets: number;
  farmer_share: number;
  opportunity_rate: number;
  unknown_age_days: number;
  heldout: HeldOut;
}

export const MODEL_VERSION = 'radar-3';

/** How many live-token comparables the Live token view carries, by market cap. */
export const LIVE_ROWS = 128;

/** The share of implied value one qualifying farmer is assumed to capture. */
export const FARMER_POOL = 0.07;
export const ESTIMATED_WALLETS = 70_000;
/** The yearly rate the locked-up capital is charged in the farm cost. */
export const OPPORTUNITY_RATE = 0.05;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface FarmEconomics {
  capital: number;
  hold_days: number;
  gas_actions: number;
  gas_usd: number;
  opportunity_usd: number;
  cost_usd: number;
  expected_usd: number;
  net_usd: number;
  verdict: string;
  break_even_deposit: number | null;
  start_date: string;
  claim_date: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  verdict: string;
  token_probability: number;
  model: {
    launch_value: number;
    token_odds: number;
    age_days: number | null;
  };
  economics: FarmEconomics;
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  verdict: string;
  token_probability: number;
  launch_value: number;
  expected_value_usd: number;
  gas_usd: number;
  opportunity_usd: number;
  farm_cost_usd: number;
  net_value_usd: number;
  break_even_deposit_usd: number | null;
  capital_usd: number;
  hold_days: number;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface IntegrityCounts {
  scanned: number;
  ranked: number;
  excluded: number;
  traded: number;
  reasons: Array<{ reason: string; count: number }>;
}

export interface Kpis {
  median_implied: number;
  farm: number;
  thin: number;
  skip: number;
  watchlist_tvl: number;
  top3: Array<{ name: string; implied: number }>;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: FittedModel;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  integrity: IntegrityCounts;
  kpis: Kpis;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;
const round2 = (n: number): number => Math.round(n * 100) / 100;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The categories the house watchlist rule keeps a board from ranking. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * Whether a protocol is one the board may rank: pre-token, and not a
 * wrapped, staked or bridged product, a versioned pool or an exchange's
 * own product, under the same rule the house watchlist uses.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  for (const e of EXCHANGES) if (p.name.startsWith(e)) return false;
  return true;
}

/** Why a pre-token protocol is kept off the board, or null when it ranks. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'token already trades';
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return p.category;
  if (VERSIONED.test(p.name)) return 'versioned name';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped / staked name';
  for (const e of EXCHANGES) if (p.name.startsWith(e)) return 'exchange name';
  return null;
}

/** Solve A x = b by Gaussian elimination with partial pivoting, or null. */
function solveLinear(aIn: number[][], bIn: number[]): number[] | null {
  const k = bIn.length;
  const m = aIn.map((row, i) => [...row, bIn[i]!]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    if (Math.abs(m[piv]![c]!) < 1e-12) return null;
    const tmp = m[c]!;
    m[c] = m[piv]!;
    m[piv] = tmp;
    const d = m[c]![c]!;
    for (let j = c; j <= k; j++) m[c]![j] = m[c]![j]! / d;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = m[r]![c]!;
      for (let j = c; j <= k; j++) m[r]![j] = m[r]![j]! - f * m[c]![j]!;
    }
  }
  return m.map((row) => row[k]!);
}

/** Ordinary least squares for a design matrix, or null when it is singular. */
function ols(features: number[][], target: number[]): number[] | null {
  const k = features[0]!.length;
  const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < features.length; i++) {
    const x = features[i]!;
    for (let r = 0; r < k; r++) {
      b[r] = b[r]! + x[r]! * target[i]!;
      for (let c = 0; c < k; c++) a[r]![c] = a[r]![c]! + x[r]! * x[c]!;
    }
  }
  return solveLinear(a, b);
}

function rSquared(features: number[][], target: number[], beta: number[]): number {
  const mean = target.reduce((s, v) => s + v, 0) / Math.max(1, target.length);
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < features.length; i++) {
    let pred = 0;
    for (let j = 0; j < beta.length; j++) pred += beta[j]! * features[i]![j]!;
    ssRes += (target[i]! - pred) ** 2;
    ssTot += (target[i]! - mean) ** 2;
  }
  return ssTot > 0 ? 1 - ssRes / ssTot : 0;
}

/** The live-token comparables: protocols that record a positive market cap and TVL. */
function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** Which held-out fold a slug falls in: the sum of its character codes, even or odd. */
function foldOf(slug: string): number {
  let s = 0;
  for (let i = 0; i < slug.length; i++) s += slug.charCodeAt(i);
  return s % 2;
}

function sizeValue(tvl: number, intercept: number, slope: number): number {
  return Math.exp(intercept + slope * Math.log(Math.max(1, tvl)));
}

/** Per-category median residual factors, shrunk toward 1 and capped. */
function categoryFactors(train: SnapshotProtocol[], intercept: number, slope: number): Record<string, number> {
  const residuals = new Map<string, number[]>();
  for (const p of train) {
    const key = p.category ?? 'Other';
    const list = residuals.get(key) ?? [];
    list.push(p.mcap_usd! / sizeValue(p.tvl_usd, intercept, slope));
    residuals.set(key, list);
  }
  const out: Record<string, number> = {};
  for (const [key, list] of residuals) {
    const m = median(list);
    out[key] = Math.min(3, Math.max(0.25, (list.length * m + 6 * 1) / (list.length + 6)));
  }
  return out;
}

/** The first version's value formula, for the held-out comparison only. */
function v1Value(p: SnapshotProtocol, age: number | null, intercept: number, slope: number, cat: Record<string, number>): number {
  const size = sizeValue(p.tvl_usd, intercept, slope);
  const cf = cat[p.category ?? 'Other'] ?? 1;
  const growth = Math.min(120, Math.max(-60, finite(p.change_7d, 0)));
  const growthMult = 1 + (growth / 100) * 0.25;
  const ageYears = (age ?? 365) / 365;
  const maturity = Math.max(0.6, Math.exp(-0.08 * ageYears));
  return size * cf * growthMult * maturity;
}

/**
 * The blind test: two folds by slug hash, five candidates, median absolute
 * log error on each fold. The value part only: the comparables already have
 * tokens, so no issuance factor applies to them.
 */
function heldOutTest(snapshot: Snapshot, comps: SnapshotProtocol[]): HeldOut {
  const folds: HeldOutFold[] = [];
  for (let f = 0; f < 2; f++) {
    const train = comps.filter((p) => foldOf(p.slug) !== f);
    const test = comps.filter((p) => foldOf(p.slug) === f);
    const sizeX = train.map((p) => [1, Math.log(p.tvl_usd)]);
    const sizeY = train.map((p) => Math.log(p.mcap_usd!));
    const sizeBeta = ols(sizeX, sizeY) ?? [7, 0.5];
    const jointX = train.map((p) => {
      const age = ageDays(snapshot.as_of, p.listed_at);
      return [1, Math.log(p.tvl_usd), finite(p.change_7d, 0), (age ?? 365) / 365];
    });
    const jointBeta = ols(jointX, sizeY);
    const cat = categoryFactors(train, sizeBeta[0]!, sizeBeta[1]!);
    const errors: Record<string, number[]> = { radar3: [], v1_formula: [], size_category: [], joint: [], flat: [] };
    for (const p of test) {
      const actual = Math.log(p.mcap_usd!);
      const age = ageDays(snapshot.as_of, p.listed_at);
      const size = sizeValue(p.tvl_usd, sizeBeta[0]!, sizeBeta[1]!);
      const preds: Record<string, number> = {
        radar3: size,
        v1_formula: v1Value(p, age, sizeBeta[0]!, sizeBeta[1]!, cat),
        size_category: size * (cat[p.category ?? 'Other'] ?? 1),
        joint:
          jointBeta === null
            ? size
            : Math.exp(
                jointBeta[0]! +
                  jointBeta[1]! * Math.log(p.tvl_usd) +
                  jointBeta[2]! * finite(p.change_7d, 0) +
                  jointBeta[3]! * ((age ?? 365) / 365),
              ),
        flat: 0.25 * p.tvl_usd,
      };
      for (const key of Object.keys(preds)) {
        errors[key]!.push(Math.abs(actual - Math.log(Math.max(1, preds[key]!))));
      }
    }
    folds.push({
      fold: f === 0 ? 'A' : 'B',
      n: test.length,
      radar3: round3(median(errors.radar3!)),
      v1_formula: round3(median(errors.v1_formula!)),
      size_category: round3(median(errors.size_category!)),
      joint: round3(median(errors.joint!)),
      flat: round3(median(errors.flat!)),
    });
  }
  const meanOf = (key: 'radar3' | 'v1_formula' | 'size_category' | 'joint' | 'flat'): number =>
    round3((folds[0]![key] + folds[1]![key]) / 2);
  return {
    split: 'two folds by slug hash (sum of the slug character codes, even or odd)',
    folds,
    mean: {
      radar3: meanOf('radar3'),
      v1_formula: meanOf('v1_formula'),
      size_category: meanOf('size_category'),
      joint: meanOf('joint'),
      flat: meanOf('flat'),
    },
  };
}

/**
 * Fit the token-odds logistic regression on all 758 protocols by gradient
 * descent: P(has token) from age in years, log TVL and seven-day growth.
 * Deterministic: fixed steps, fixed rate, no randomness.
 */
function fitLogit(snapshot: Snapshot): {
  intercept: number;
  agePerYear: number;
  logTvl: number;
  growthPerPt: number;
} {
  const rows = snapshot.protocols.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    return {
      x: [1, (age ?? 365) / 365, Math.log(Math.max(1, p.tvl_usd)), finite(p.change_7d, 0) / 100],
      y: isPreToken(p) ? 0 : 1,
    };
  });
  const k = 4;
  const mean = [0, 0, 0, 0];
  const sd = [1, 1, 1, 1];
  for (let j = 1; j < k; j++) {
    const col = rows.map((r) => r.x[j]!);
    mean[j] = col.reduce((s, v) => s + v, 0) / col.length;
    const variance = col.reduce((s, v) => s + (v - mean[j]!) ** 2, 0) / col.length;
    sd[j] = Math.sqrt(variance) || 1;
  }
  const w = [0, 0, 0, 0];
  const steps = 2000;
  const rate = 0.05;
  for (let step = 0; step < steps; step++) {
    const grad = [0, 0, 0, 0];
    for (const r of rows) {
      const z = [r.x[0]!, (r.x[1]! - mean[1]!) / sd[1]!, (r.x[2]! - mean[2]!) / sd[2]!, (r.x[3]! - mean[3]!) / sd[3]!];
      let s = 0;
      for (let j = 0; j < k; j++) s += w[j]! * z[j]!;
      const clipped = Math.max(-30, Math.min(30, s));
      const prob = 1 / (1 + Math.exp(-clipped));
      for (let j = 0; j < k; j++) grad[j] = grad[j]! + (prob - r.y) * z[j]!;
    }
    for (let j = 0; j < k; j++) w[j] = w[j]! - (rate * grad[j]!) / rows.length;
  }
  // Back to raw units, so the page recomputes the odds from the stored numbers.
  let intercept = w[0]!;
  for (let j = 1; j < k; j++) intercept -= (w[j]! * mean[j]!) / sd[j]!;
  return {
    intercept: round4(intercept),
    agePerYear: round4(w[1]! / sd[1]!),
    logTvl: round4(w[2]! / sd[2]!),
    growthPerPt: round4(w[3]! / sd[3]! / 100),
  };
}

/** Fit the model on the snapshot's own figures, at run time. */
export function fitModel(snapshot: Snapshot): FittedModel {
  const comps = compsOf(snapshot);
  const sizeX = comps.map((p) => [1, Math.log(p.tvl_usd)]);
  const sizeY = comps.map((p) => Math.log(p.mcap_usd!));
  const sizeBeta = ols(sizeX, sizeY) ?? [7, 0.5];
  const jointX = comps.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    return [1, Math.log(p.tvl_usd), finite(p.change_7d, 0), (age ?? 365) / 365];
  });
  const jointBeta = ols(jointX, sizeY) ?? [0, 0, 0, 0];
  const logit = fitLogit(snapshot);
  return {
    version: MODEL_VERSION,
    comps: comps.length,
    intercept: round4(sizeBeta[0]!),
    slope: round4(sizeBeta[1]!),
    r2: round4(rSquared(sizeX, sizeY, sizeBeta)),
    joint_intercept: round4(jointBeta[0]!),
    joint_log_tvl: round4(jointBeta[1]!),
    joint_growth_per_pt: round4(jointBeta[2]!),
    joint_age_per_year: round4(jointBeta[3]!),
    joint_r2: round4(rSquared(jointX, sizeY, jointBeta)),
    logit_intercept: logit.intercept,
    logit_age_per_year: logit.agePerYear,
    logit_log_tvl: logit.logTvl,
    logit_growth_per_pt: logit.growthPerPt,
    farmer_pool: FARMER_POOL,
    estimated_wallets: ESTIMATED_WALLETS,
    farmer_share: FARMER_POOL / ESTIMATED_WALLETS,
    opportunity_rate: OPPORTUNITY_RATE,
    unknown_age_days: 365,
    heldout: heldOutTest(snapshot, comps),
  };
}

/** P(has token) for one protocol under the fitted logistic odds. */
function tokenProb(protocol: SnapshotProtocol, asOf: string, model: FittedModel): number {
  const age = ageDays(asOf, protocol.listed_at);
  const ageYears = (age ?? model.unknown_age_days) / 365;
  const z =
    model.logit_intercept +
    model.logit_age_per_year * ageYears +
    model.logit_log_tvl * Math.log(Math.max(1, protocol.tvl_usd)) +
    model.logit_growth_per_pt * finite(protocol.change_7d, 0);
  const clipped = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-clipped));
}

/** The launch value, the token odds and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: FittedModel,
): { implied: number; launch: number; odds: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  // The rounded coefficients are used here, so the dashboard page, which
  // carries only the rounded numbers, recomputes exactly this value. The
  // launch value is rounded before it is multiplied, for the same reason:
  // the page carries the rounded launch value, not the raw curve.
  const launch = Math.round(sizeValue(protocol.tvl_usd, model.intercept, model.slope));
  const odds = round4(1 - tokenProb(protocol, asOf, model));
  const implied = Math.max(1, Math.round(launch * odds));
  return { implied, launch, odds, age };
}

/** A verdict from the net against the cost of farming. */
function verdictFor(net: number, cost: number): string {
  if (net > 2 * cost) return 'FARM';
  if (net > 0) return 'THIN';
  return 'SKIP';
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Typical gas for one simple transaction on a chain, in whole dollars, from the chain's own fees. */
const GAS_USD: Record<string, number> = {
  Ethereum: 4, Base: 0.05, Arbitrum: 0.1, Optimism: 0.05, Polygon: 0.02,
  Solana: 0.01, Avalanche: 0.3, BNB: 0.15, Binance: 0.15, Sonic: 0.05,
  Berachain: 0.05, Hyperliquid: 0.01, Sui: 0.01, Aptos: 0.01, Sei: 0.01,
  Mantle: 0.05, Linea: 0.05, Scroll: 0.05, zkSync: 0.1, Starknet: 0.1,
  Cosmos: 0.05, Osmosis: 0.05, Injective: 0.01, Near: 0.01, Fantom: 0.05,
};

function gasFor(chain: string): number {
  return GAS_USD[chain] ?? 1;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * One row's farm economics: what the position is expected to return, what
 * it costs, the net, the verdict, and the deposit at which the net reaches
 * zero (a ceiling: above it the opportunity cost eats the airdrop).
 */
export function farmEconomics(
  p: SnapshotProtocol,
  implied: number,
  age: number | null,
  asOf: string,
  model: FittedModel,
): FarmEconomics {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chainOf(p));
  const gasActions = 3 + Math.ceil(hold / 7);
  const gasUsd = round2(gasActions * gas);
  const opportunityUsd = round2((capital * model.opportunity_rate * hold) / 365);
  const costUsd = round2(gasUsd + opportunityUsd);
  const expectedUsd = round2(implied * model.farmer_share);
  const netUsd = round2(expectedUsd - costUsd);
  const verdict = verdictFor(netUsd, costUsd);
  const breakEven =
    expectedUsd > gasUsd
      ? Math.round((expectedUsd - gasUsd) / ((model.opportunity_rate * hold) / 365))
      : null;
  return {
    capital,
    hold_days: hold,
    gas_actions: gasActions,
    gas_usd: gasUsd,
    opportunity_usd: opportunityUsd,
    cost_usd: costUsd,
    expected_usd: expectedUsd,
    net_usd: netUsd,
    verdict,
    break_even_deposit: breakEven,
    start_date: asOf,
    claim_date: addDays(asOf, hold),
  };
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${name}'s chain and use its main app once.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second qualifying action, different from the first. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $${Math.round(capital / 2)} against the deposit on ${name} and repay it within the week.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Swap $${Math.round(capital / 2)} through ${name} on ${chain} and add the result to the pool.`;
  if (c.includes('bridge')) return `Bridge a second, smaller amount through ${name} on a different day.`;
  if (c.includes('staking') || c.includes('restak')) return `Delegate a second stake through ${name} and check the rewards page.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit a second tranche into another ${name} vault on ${chain}.`;
  if (c.includes('rwa')) return `Mint a second, smaller amount of the yield asset and hold it beside the first.`;
  return `Make a second deposit of $${Math.round(capital / 2)} into ${name} on ${chain} on a different day.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a
 * time. The plan is derived from the protocol's own record (category,
 * chains, TVL, age), never from a hand-written list of names. Gas is
 * priced from the chain the position sits on.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const gasText = gas >= 1 ? `about $${round2(gas)} of gas` : `about $${gas} of gas`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'nothing but the wallet',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gasText}`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: `$${Math.round(capital / 2)} of capital and ${gasText}`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `${gasText} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: FittedModel): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // Every strict pre-token protocol ranks, whatever its TVL: the watchlist
  // is the floor, never the ceiling, and the old below-floor cap is gone.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    const econ = farmEconomics(p, v.implied, v.age, snapshot.as_of, model);
    return { p, v, econ };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    verdict: s.econ.verdict,
    token_probability: s.v.odds,
    model: {
      launch_value: s.v.launch,
      token_odds: s.v.odds,
      age_days: s.v.age,
    },
    economics: s.econ,
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** The live-token comparables, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return compsOf(snapshot)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    verdict: row.verdict,
    token_probability: row.token_probability,
    launch_value: row.model.launch_value,
    expected_value_usd: row.economics.expected_usd,
    gas_usd: row.economics.gas_usd,
    opportunity_usd: row.economics.opportunity_usd,
    farm_cost_usd: row.economics.cost_usd,
    net_value_usd: row.economics.net_usd,
    break_even_deposit_usd: row.economics.break_even_deposit,
    capital_usd: row.economics.capital,
    hold_days: row.economics.hold_days,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const model = fitModel(snapshot);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;

  const reasons = new Map<string, number>();
  let excluded = 0;
  let traded = 0;
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) {
      traded++;
      continue;
    }
    const reason = exclusionReason(p);
    if (reason === null) continue;
    excluded++;
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const integrity: IntegrityCounts = {
    scanned: snapshot.protocols.length,
    ranked: board.length,
    excluded,
    traded,
    reasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : 1)),
  };

  const implieds = board.map((r) => r.implied_value_usd);
  const watchlistTvl = snapshot.watchlist.reduce((s, slug) => {
    const p = snapshot.protocols.find((q) => q.slug === slug);
    return s + (p?.tvl_usd ?? 0);
  }, 0);
  const kpis: Kpis = {
    median_implied: Math.round(median(implieds)),
    farm: board.filter((r) => r.verdict === 'FARM').length,
    thin: board.filter((r) => r.verdict === 'THIN').length,
    skip: board.filter((r) => r.verdict === 'SKIP').length,
    watchlist_tvl: watchlistTvl,
    top3: board.slice(0, 3).map((r) => ({ name: r.name, implied: r.implied_value_usd })),
  };

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    integrity,
    kpis,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
