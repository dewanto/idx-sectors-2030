/**
 * Watchlist — the quota-efficient sync universe.
 *
 * The Sectors API bills ~1 credit per ticker per sync run, so the daily cost
 * is driven by HOW MANY companies are pulled, not by window width. This module
 * ranks the local database (market-intel scores, signals, SDG evidence — all
 * recomputed locally at 0 credits) and selects the top-N "potential" companies
 * that keep receiving live data. Companies outside the watchlist keep their
 * stored series and simply age.
 *
 * Selection is deliberately auditable: every pick persists its per-component
 * points, so "why is this company synced?" has a stored answer.
 */
import { db } from "./index";
import * as s from "./schema";
import { sql } from "drizzle-orm";

export interface WatchlistBreakdown {
  /** 60% — market_intel_scores.total_score */
  marketIntel: number;
  /** 15% — strongest active signal strength */
  signal: number;
  /** 15% — strongest SDG mapping evidence */
  sdgEvidence: number;
  /** 10% — bonus when the market condition is DISLOCATION or CONFIRMATION */
  marketCondition: number;
  /** flat penalty when the stock trades zero volume (suspended) */
  suspendedPenalty: number;
}

export interface WatchlistPick {
  companyId: number;
  ticker: string;
  companyName: string;
  rank: number;
  potentialScore: number;
  breakdown: WatchlistBreakdown;
  /** carried over from the previous selection so the circuit breaker survives re-picks */
  emptyRuns: number;
}

export type WatchlistCandidate = Omit<WatchlistPick, "rank" | "emptyRuns">;

/** A suspended name (constant close, zero volume) wastes 1 credit/run — push it out. */
const SUSPENDED_PENALTY = 30;

export async function computeWatchlistPicks(limit: number): Promise<WatchlistCandidate[]> {
  const intel = await db
    .select({
      companyId: s.marketIntelScores.companyId,
      totalScore: s.marketIntelScores.totalScore,
      condition: s.marketIntelScores.marketCondition,
      mcap: s.companies.marketCapIdr,
      ticker: s.companies.ticker,
      companyName: s.companies.companyName,
    })
    .from(s.marketIntelScores)
    .innerJoin(s.companies, sql`${s.companies.id} = ${s.marketIntelScores.companyId}`);

  const signalRows = await db
    .select({ companyId: s.signals.companyId, strength: s.signals.signalStrength })
    .from(s.signals);
  const signalMax = new Map<number, number>();
  for (const r of signalRows) {
    signalMax.set(r.companyId, Math.max(signalMax.get(r.companyId) ?? 0, r.strength));
  }

  const evidenceRows = await db
    .select({ companyId: s.businessEvents.companyId, evidence: s.eventSdgMappings.evidenceScore })
    .from(s.eventSdgMappings)
    .innerJoin(s.businessEvents, sql`${s.businessEvents.id} = ${s.eventSdgMappings.eventId}`);
  const evidenceMax = new Map<number, number>();
  for (const r of evidenceRows) {
    evidenceMax.set(r.companyId, Math.max(evidenceMax.get(r.companyId) ?? 0, r.evidence));
  }

  /* suspended = last 5 stored sessions all zero-volume (the snapshot's
     volumeRatio is floored to a neutral 1 for these, so it cannot be used) */
  const priceRows = await db
    .select({ companyId: s.marketPrices.companyId, volume: s.marketPrices.volume })
    .from(s.marketPrices)
    .orderBy(s.marketPrices.companyId, s.marketPrices.tradingDate);
  const lastVolumes = new Map<number, number[]>();
  for (const r of priceRows) {
    const arr = lastVolumes.get(r.companyId) ?? [];
    arr.push(r.volume);
    lastVolumes.set(r.companyId, arr);
  }

  const scored = intel.map((row) => {
    const sig = signalMax.get(row.companyId) ?? 0;
    const ev = evidenceMax.get(row.companyId) ?? 0;
    const cond = row.condition === "DISLOCATION" || row.condition === "CONFIRMATION" ? 100 : 0;
    const volumes = lastVolumes.get(row.companyId) ?? [];
    const recent = volumes.slice(-5);
    const suspended = recent.length === 5 && recent.every((v) => v === 0);
    const breakdown: WatchlistBreakdown = {
      marketIntel: +(row.totalScore * 0.6).toFixed(1),
      signal: +(sig * 0.15).toFixed(1),
      sdgEvidence: +(ev * 0.15).toFixed(1),
      marketCondition: +(cond * 0.1).toFixed(1),
      suspendedPenalty: suspended ? -SUSPENDED_PENALTY : 0,
    };
    const potentialScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          breakdown.marketIntel +
            breakdown.signal +
            breakdown.sdgEvidence +
            breakdown.marketCondition +
            breakdown.suspendedPenalty,
        ),
      ),
    );
    return {
      companyId: row.companyId,
      ticker: row.ticker,
      companyName: row.companyName,
      potentialScore,
      breakdown,
      mcap: row.mcap,
    };
  });

  scored.sort(
    (a, b) =>
      b.potentialScore - a.potentialScore || b.mcap - a.mcap || a.ticker.localeCompare(b.ticker),
  );
  return scored.slice(0, limit).map(({ mcap: _mcap, ...pick }) => pick);
}

/**
 * Recompute and persist the watchlist. Returns the picks in rank order with
 * each company's previous `emptyRuns` streak carried over.
 */
export async function refreshWatchlist(limit: number): Promise<WatchlistPick[]> {
  const picks = await computeWatchlistPicks(limit);
  const prior = await db.select().from(s.watchlist);
  const priorEmpty = new Map(prior.map((p) => [p.companyId, p.emptyRuns]));

  await db.delete(s.watchlist);
  if (picks.length > 0) {
    await db.insert(s.watchlist).values(
      picks.map((p, i) => ({
        companyId: p.companyId,
        rank: i + 1,
        potentialScore: p.potentialScore,
        scoreBreakdown: p.breakdown,
        emptyRuns: priorEmpty.get(p.companyId) ?? 0,
        selectedAt: new Date().toISOString().slice(0, 10),
      })),
    );
  }

  return picks.map((p, i) => ({ ...p, rank: i + 1, emptyRuns: priorEmpty.get(p.companyId) ?? 0 }));
}
