// Token Radar's model, radar-2: a value model fitted to the snapshot itself.
//
// The board ranks every watchlist protocol (the floor) plus the early radar:
// pre-token protocols below the watchlist floor, by TVL. Live-token protocols
// are kept apart and shown with the market's own value, never ranked.
//
// Implied value is fitted, not asserted. At runtime the program fits the
// model on the snapshot's own live-token comparables (protocols that record
// a market cap), so no protocol name and no constant is ever special-cased:
//
//   size curve   ln(mcap) = a + b * ln(tvl)        (OLS on the comps)
//   category     median(mcap / size(tvl)) per category, shrunk toward 1
//                and capped to [0.25, 3], so one outlier comparable cannot
//                dominate its whole category
//   growth       1 + clamp(change_7d, -60, 120) / 100 * 0.25
//   maturity     exp(-0.08 * age_years), clamped to [0.6, 1]
//   token prob.  0.4 + 0.6 * (share of the category that already has a token)
//
//   implied = round( exp(a + b*ln(tvl)) * category * growth * maturity
//                    * token_probability )
//
// What the fit found on this snapshot (128 comps, DefiLlama 2026-11-14):
// the size curve is sublinear (b ~ 0.49, R^2 ~ 0.19), so a protocol ten
// times bigger is worth only about three times more per dollar of TVL.
// Categories differ by up to ~6x around the curve (bridges and basis
// trading near 3x, liquid staking near 0.5x). Seven-day growth is
// mean-reverting in the cross-section (fitted slope about -0.04 per point),
// so the model uses a small positive momentum weight instead of chasing
// it. Age is slightly negative (about -0.10 per year in log terms): a
// protocol that has run for years without a token is less likely to issue
// one. Held out by slug hash, the size curve alone beats the starter's
// flat 0.25x multiple (median |log error| 1.13 vs 1.71). The dashboard's
// model panel states the fitted numbers for this run.

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

/** The fitted model, as the dashboard states it. */
export interface FittedModel {
  version: string;
  comps: number;
  intercept: number;
  slope: number;
  r2: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_rate: number;
  maturity_floor: number;
  unknown_age_days: number;
  category_factor: Record<string, number>;
  token_share: Record<string, number>;
}

export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
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
    size_value: number;
    category_factor: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    token_probability: number;
    age_days: number | null;
  };
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
  growth_multiplier: number;
  maturity_multiplier: number;
  category_factor: number;
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

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/**
 * Fit the model on the snapshot's live-token comparables: protocols that
 * record a positive market cap and a positive TVL. Two passes: an OLS
 * log-log size curve, then per-category median residual factors shrunk
 * toward 1, and per-category token shares for the issuance term.
 */
export function fitModel(snapshot: Snapshot): FittedModel {
  const comps = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd!));
  const n = comps.length;
  const mx = xs.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const my = ys.reduce((a, b) => a + b, 0) / Math.max(1, n);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0.5;
  const intercept = my - slope * mx;
  const r2 = syy > 0 && sxx > 0 ? (sxy * sxy) / (sxx * syy) : 0;

  const sizeValue = (tvl: number): number => Math.exp(intercept + slope * Math.log(Math.max(1, tvl)));
  const residuals = new Map<string, number[]>();
  for (const p of comps) {
    const key = p.category ?? 'Other';
    const list = residuals.get(key) ?? [];
    list.push(p.mcap_usd! / sizeValue(p.tvl_usd));
    residuals.set(key, list);
  }
  const category_factor: Record<string, number> = {};
  for (const [key, list] of residuals) {
    const m = median(list);
    // Shrink toward 1 (a category with one comparable barely moves the
    // factor) and cap the range: one comparable's market cap can be 400x
    // its TVL, and a single outlier must not dominate its whole category.
    const shrunk = (list.length * m + 6 * 1) / (list.length + 6);
    category_factor[key] = Math.min(3, Math.max(0.25, shrunk));
  }

  const totals = new Map<string, [number, number]>();
  for (const p of snapshot.protocols) {
    const key = p.category ?? 'Other';
    const entry = totals.get(key) ?? [0, 0];
    entry[1] += 1;
    if (!isPreToken(p)) entry[0] += 1;
    totals.set(key, entry);
  }
  const token_share: Record<string, number> = {};
  for (const [key, [withToken, total]] of totals) {
    token_share[key] = total > 0 ? withToken / total : 0.5;
  }

  return {
    version: MODEL_VERSION,
    comps: n,
    intercept: round4(intercept),
    slope: round4(slope),
    r2: round4(r2),
    growth_weight: 0.25,
    growth_floor: -60,
    growth_cap: 120,
    maturity_rate: 0.08,
    maturity_floor: 0.6,
    unknown_age_days: 365,
    category_factor,
    token_share,
  };
}

/** The three multipliers and the implied value one protocol gets under the fitted model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: FittedModel,
): { implied: number; size: number; catFactor: number; growthPct: number; growthMult: number; maturityMult: number; tokenProb: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const catKey = protocol.category ?? 'Other';
  // The factors are rounded before they are multiplied, so the dashboard
  // page, which carries only the rounded factors, recomputes exactly the
  // number board.json carries.
  const catFactor = round4(model.category_factor[catKey] ?? 1);
  const share = model.token_share[catKey] ?? 0.5;
  const tokenProb = round4(0.4 + 0.6 * share);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = round4(1 + (growthPct / 100) * model.growth_weight);
  const ageYears = (age ?? model.unknown_age_days) / 365;
  const maturityMult = round4(Math.max(model.maturity_floor, Math.exp(-model.maturity_rate * ageYears)));
  const size = Math.exp(model.intercept + model.slope * Math.log(Math.max(1, protocol.tvl_usd)));
  const implied = Math.max(1, Math.round(size * catFactor * growthMult * maturityMult * tokenProb));
  return { implied, size: Math.round(size), catFactor, growthPct, growthMult, maturityMult, tokenProb, age };
}

/** A short verdict from the implied value and the value per dollar of TVL. */
function verdictFor(implied: number, tvl: number): string {
  const ratio = implied / Math.max(1, tvl);
  if (implied >= 20_000_000 || ratio >= 0.35) return 'Farm it';
  if (implied >= 8_000_000 || ratio >= 0.15) return 'Worth a position';
  if (implied >= 3_000_000 || ratio >= 0.07) return 'Watch it';
  return 'Low priority';
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
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, v };
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
    verdict: verdictFor(s.v.implied, s.p.tvl_usd),
    token_probability: s.v.tokenProb,
    model: {
      size_value: s.v.size,
      category_factor: s.v.catFactor,
      growth_pct: s.v.growthPct,
      growth_multiplier: s.v.growthMult,
      maturity_multiplier: s.v.maturityMult,
      token_probability: s.v.tokenProb,
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
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

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
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
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    category_factor: row.model.category_factor,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const model = fitModel(snapshot);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
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
