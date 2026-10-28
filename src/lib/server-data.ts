import "server-only";
import { PublicKey } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import { MARKETS, MAINNET_RPC, SELL_DISCOUNT, BUY_DISCOUNT, TERM_DAYS, US_TREASURY_1Y_PCT } from "./markets";
import { perpMaxLeverage, perpFunding8hBps } from "./vault/sdk";
import verifiedPerpsOutcomes from "./vault/deployment.devnet.verify-perps-outcomes.json";
import type {
  Bump,
  MarketSnapshot,
  OutcomeMarket,
  PerpMarketSnapshot,
  PythFeedDetail,
  PythTelemetry,
  SnapshotResponse,
  YieldCurveTenor,
} from "./types";

const HERMES = "https://hermes.pyth.network";
const XSTOCKS = "https://api.xstocks.fi/api/v2/public/assets";

const PUSH_ORACLE = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");
const shard0 = Buffer.from([0, 0]);
export const pythAccount = (feedId: string) =>
  PublicKey.findProgramAddressSync([shard0, Buffer.from(feedId.replace(/^0x/, ""), "hex")], PUSH_ORACLE)[0].toBase58();

export type PythSource = "hermes" | "solana-pyth-receiver";

const RPCS = [MAINNET_RPC, "https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"].filter(
  (v, i, a) => a.indexOf(v) === i
);

export async function rpc(method: string, params: unknown[]) {
  let last: unknown;
  for (const url of [...RPCS, ...RPCS]) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
        signal: AbortSignal.timeout(7000),
      });
      if (!r.ok) throw new Error(`rpc ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return { ...j, rpcUrl: url };
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw last;
}

/** Fast batched getMultipleAccounts in chunks of 5 (supported by publicnode and standard RPCs) with sequential fallback. */
export async function getAccounts(addrs: string[], encoding: "jsonParsed" | "base64") {
  const out: unknown[] = new Array(addrs.length).fill(null);
  const chunkSize = 5;
  for (let start = 0; start < addrs.length; start += chunkSize) {
    const slice = addrs.slice(start, start + chunkSize);
    try {
      const j = await rpc("getMultipleAccounts", [slice, { encoding }]);
      const vals = (j.result?.value ?? []) as unknown[];
      vals.forEach((v, idx) => {
        out[start + idx] = v ?? null;
      });
    } catch {
      for (let idx = 0; idx < slice.length; idx++) {
        try {
          const j = await rpc("getAccountInfo", [slice[idx], { encoding }]);
          out[start + idx] = j.result?.value ?? null;
        } catch {
          out[start + idx] = null;
        }
      }
    }
  }
  return { result: { value: out } };
}

/**
 * Decodes the full 134-byte PriceUpdateV2 account on Solana mainnet (`pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT`):
 * price, conf, expo, publish_time, prev_publish_time, ema_price, ema_conf, posted_slot.
 */
function decodePriceUpdateV2(
  b64: string,
  feedId: string,
  account: string,
  symbol: string,
  channel: string
): PythFeedDetail | null {
  const d = Buffer.from(b64, "base64");
  const feedBuf = Buffer.from(feedId.replace(/^0x/, ""), "hex");
  const idx = d.indexOf(feedBuf);
  if (idx < 0 || idx + 32 + 60 > d.length) return null;
  const o = idx + 32;
  const rawPrice = Number(d.readBigInt64LE(o));
  const rawConf = Number(d.readBigUInt64LE(o + 8));
  const expo = d.readInt32LE(o + 16);
  const publish = Number(d.readBigInt64LE(o + 20));
  const prevPublish = Number(d.readBigInt64LE(o + 28));
  const rawEmaPrice = Number(d.readBigInt64LE(o + 36));
  const rawEmaConf = Number(d.readBigUInt64LE(o + 44));
  const postedSlot = Number(d.readBigUInt64LE(o + 52));
  const scale = 10 ** expo;
  const price = rawPrice * scale;
  const conf = rawConf * scale;
  const emaPrice = rawEmaPrice * scale;
  const emaConf = rawEmaConf * scale;
  if (!Number.isFinite(price) || price <= 0) return null;
  const confBps = Number(((conf / price) * 10_000).toFixed(2));
  return {
    price,
    conf,
    confBps,
    emaPrice: Number.isFinite(emaPrice) && emaPrice > 0 ? emaPrice : price,
    emaConf: Number.isFinite(emaConf) && emaConf >= 0 ? emaConf : conf,
    publish,
    prevPublish,
    postedSlot,
    feedId,
    account,
    symbol,
    channel,
  };
}

export async function fetchPyth(
  specs: { id: string; symbol: string; channel: string }[]
): Promise<{ source: PythSource; prices: Record<string, PythFeedDetail> }> {
  const ids = specs.map((s) => s.id);
  const accts = ids.map(pythAccount);
  const key = process.env.PYTH_API_KEY?.trim() || process.env.HERMES_API_KEY?.trim();
  if (key) {
    try {
      const base = process.env.PYTH_HERMES_URL?.trim() || "https://pyth.dourolabs.app/hermes/v2/updates/price/latest";
      const q = ids.map((i) => `ids[]=${i}`).join("&");
      const r = await fetch(`${base}?${q}&parsed=true`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) throw new Error(`hermes ${r.status}`);
      const j = await r.json();
      const out: Record<string, PythFeedDetail> = {};
      for (const p of j.parsed ?? []) {
        const specIdx = ids.indexOf(p.id);
        const sp = specs[specIdx] ?? { id: p.id, symbol: p.id, channel: "fixed_rate@200ms" };
        const scale = 10 ** p.price.expo;
        const price = Number(p.price.price) * scale;
        const conf = Number(p.price.conf) * scale;
        const emaPrice = p.ema_price ? Number(p.ema_price.price) * 10 ** p.ema_price.expo : price;
        const emaConf = p.ema_price ? Number(p.ema_price.conf) * 10 ** p.ema_price.expo : conf;
        out[p.id] = {
          price,
          conf,
          confBps: price > 0 ? Number(((conf / price) * 10_000).toFixed(2)) : 0,
          emaPrice,
          emaConf,
          publish: p.price.publish_time,
          prevPublish: p.metadata?.prev_publish_time ?? p.price.publish_time,
          postedSlot: p.metadata?.slot ?? 0,
          feedId: p.id,
          account: pythAccount(p.id),
          symbol: sp.symbol,
          channel: sp.channel,
        };
      }
      if (Object.keys(out).length) return { source: "hermes", prices: out };
    } catch {
      /* fall through to the onchain Pyth PriceUpdateV2 accounts */
    }
  }

  const j = await getAccounts(accts, "base64");
  const out: Record<string, PythFeedDetail> = {};
  (j.result.value as ({ data: [string, string] } | null)[]).forEach((v, i) => {
    if (!v) return;
    const sp = specs[i];
    const parsed = decodePriceUpdateV2(v.data[0], sp.id, accts[i], sp.symbol, sp.channel);
    if (parsed) out[sp.id] = parsed;
  });
  return { source: "solana-pyth-receiver", prices: out };
}

export interface ScaledConfig {
  multiplier: number;
  newMultiplier: number;
  effective: number;
  authority: string;
  symbol: string;
  name: string;
  supply: string;
  decimals: number;
  owner: string;
}

export async function fetchScaled(mints: string[]): Promise<Record<string, ScaledConfig>> {
  const j = await getAccounts(mints, "jsonParsed");
  const out: Record<string, ScaledConfig> = {};
  (j.result.value as never[]).forEach(
    (
      v: {
        owner: string;
        data: {
          parsed: {
            info: {
              decimals: number;
              supply: string;
              extensions: { extension: string; state: Record<string, unknown> }[];
            };
          };
        };
      } | null,
      i: number
    ) => {
      if (!v) return;
      const info = v.data.parsed.info;
      const ext = Object.fromEntries(info.extensions.map((e) => [e.extension, e.state]));
      const s = ext.scaledUiAmountConfig as
        | { multiplier: string; newMultiplier: string; newMultiplierEffectiveTimestamp: number; authority: string }
        | undefined;
      const md = ext.tokenMetadata as { symbol: string; name: string } | undefined;
      if (!s) return;
      out[mints[i]] = {
        multiplier: Number(s.multiplier),
        newMultiplier: Number(s.newMultiplier),
        effective: s.newMultiplierEffectiveTimestamp,
        authority: s.authority,
        symbol: md?.symbol ?? "",
        name: md?.name ?? "",
        supply: info.supply,
        decimals: info.decimals,
        owner: v.owner,
      };
    }
  );
  return out;
}

export async function fetchHistory(x: string): Promise<Bump[]> {
  const r = await fetch(`${XSTOCKS}/${x}/multiplier/history?network=Solana`, {
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`history ${x} ${r.status}`);
  const j = await r.json();
  return (j.nodes ?? [])
    .map((n: { activationDateTime: string; previousMultiplier: number; multiplier: number; reason: string }) => ({
      at: n.activationDateTime,
      prev: Number(n.previousMultiplier),
      next: Number(n.multiplier),
      reason: n.reason,
    }))
    .sort((a: Bump, b: Bump) => a.at.localeCompare(b.at));
}

export function effectiveMultiplier(c: ScaledConfig, nowSec = Math.floor(Date.now() / 1000)) {
  return nowSec >= c.effective ? c.newMultiplier : c.multiplier;
}

export function trailing(bumps: Bump[], days = TERM_DAYS, now = Date.now()) {
  const cutoff = now - days * 86400_000;
  return (
    bumps
      .filter((b) => new Date(b.at).getTime() >= cutoff && new Date(b.at).getTime() <= now)
      .reduce((acc, b) => acc * (b.next / b.prev), 1) - 1
  );
}

/** Live Solana market price for xStock mints (Jupiter price API, keyless). */
export async function fetchJupiter(mints: string[]): Promise<Record<string, { price: number; at: number }>> {
  const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mints.join(",")}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`jupiter ${r.status}`);
  const j = await r.json();
  const out: Record<string, { price: number; at: number }> = {};
  for (const m of mints)
    if (j[m]?.usdPrice) out[m] = { price: Number(j[m].usdPrice), at: Math.floor(Date.now() / 1000) };
  return out;
}

async function fetchPythSession(): Promise<SnapshotResponse["pythSession"]> {
  let isOpen = false;
  let nextOpen: number | null = null;
  let nextClose: number | null = null;
  try {
    const r = await fetch("https://hermes.pyth.network/v2/price_feeds?query=Equity.US.SPY/USD&asset_type=equity", {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (r.ok) {
      const arr = await r.json();
      const mh = arr?.[0]?.market_hours;
      if (mh) {
        isOpen = !!mh.is_open;
        nextOpen = mh.next_open ?? null;
        nextClose = mh.next_close ?? null;
      }
    }
  } catch {
    const now = new Date();
    const day = now.getUTCDay();
    const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
    isOpen = day >= 1 && day <= 5 && mins >= 13 * 60 + 30 && mins < 20 * 60;
  }
  const nowUtcHours = new Date().getUTCHours();
  const session: "REGULAR" | "EXTENDED" | "OVERNIGHT" = isOpen
    ? "REGULAR"
    : nowUtcHours >= 8 && nowUtcHours < 24
    ? "EXTENDED"
    : "OVERNIGHT";
  return {
    isOpen,
    session,
    nextOpen,
    nextClose,
    hermesEndpoint: "https://hermes.pyth.network/v2/price_feeds",
    solanaPushProgram: PUSH_ORACLE.toBase58(),
  };
}

const MEMO_FILE =
  process.env.VERCEL || process.env.COUPON_CACHE_DIR
    ? path.join(process.env.COUPON_CACHE_DIR || "/tmp", "coupon-memo.json")
    : path.join(process.cwd(), ".cache", "memo.json");
const memo = new Map<string, { at: number; v: unknown }>(
  (() => {
    try {
      return Object.entries(JSON.parse(fs.readFileSync(MEMO_FILE, "utf8"))) as [string, { at: number; v: unknown }][];
    } catch {
      return [];
    }
  })()
);
function persist() {
  try {
    fs.mkdirSync(path.dirname(MEMO_FILE), { recursive: true });
    fs.writeFileSync(MEMO_FILE, JSON.stringify(Object.fromEntries(memo)));
  } catch {
    /* read only fs */
  }
}
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as T;
  try {
    const v = await fn();
    memo.set(key, { at: Date.now(), v });
    persist();
    return v;
  } catch (e) {
    if (hit) return hit.v as T;
    throw e;
  }
}

export async function buildSnapshot(): Promise<SnapshotResponse> {
  const errors: string[] = [];
  // Fetch all 27 Pyth PriceUpdateV2 accounts (equityFeed 50ms, xFeed 200ms, rrFeed 200ms)
  const pythSpecs = MARKETS.flatMap((m) => [
    { id: m.equityFeed, symbol: m.equityFeedSymbol, channel: "fixed_rate@50ms" },
    { id: m.xFeed, symbol: m.xFeedSymbol, channel: "fixed_rate@200ms" },
    { id: m.rrFeed, symbol: m.rrFeedSymbol, channel: "fixed_rate@200ms" },
  ]);

  const chainP = (async () => {
    const [scaled, pythRes, slotRes, pythSession] = await Promise.all([
      cached("scaled", 45_000, () => fetchScaled(MARKETS.map((m) => m.mint))).catch((e) => {
        errors.push(String(e));
        return {} as Record<string, ScaledConfig>;
      }),
      cached("pyth27", 20_000, () => fetchPyth(pythSpecs)).catch((e) => {
        errors.push(String(e));
        return { source: "solana-pyth-receiver" as PythSource, prices: {} as Record<string, PythFeedDetail> };
      }),
      rpc("getSlot", [])
        .then((r) => Number(r.result ?? 0))
        .catch(() => 0),
      cached("pythSession", 60_000, () => fetchPythSession()),
    ]);
    return { scaled, pythRes, slot: slotRes, pythSession };
  })();

  const [{ scaled, pythRes, slot, pythSession }, histories, jup] = await Promise.all([
    chainP,
    Promise.all(MARKETS.map((m) => cached(`hist:${m.x}`, 600_000, () => fetchHistory(m.x)).catch(() => null))),
    cached("jup", 8_000, () => fetchJupiter(MARKETS.map((m) => m.mint))).catch(() => ({} as Record<string, { price: number; at: number }>)),
  ]);

  const pyth = pythRes.prices;
  const now = Date.now();
  const markets: MarketSnapshot[] = MARKETS.map((m, i) => {
    const eq = pyth[m.equityFeed] ?? null;
    const xp = pyth[m.xFeed] ?? null;
    const rr = pyth[m.rrFeed] ?? null;
    const sc = scaled[m.mint];
    let bumps = histories[i] ?? [];
    let bumpsSource: MarketSnapshot["bumpsSource"] = histories[i] ? "xstocks-api" : "chain-only";
    if (!histories[i] && sc && sc.newMultiplier !== sc.multiplier) {
      bumps = [
        {
          at: new Date(sc.effective * 1000).toISOString(),
          prev: sc.multiplier,
          next: sc.newMultiplier,
          reason: "Onchain pending field",
        },
      ];
      bumpsSource = "chain-only";
    }
    const mult = sc ? effectiveMultiplier(sc) : rr?.price ?? null;
    const sinceLaunch = mult != null ? Math.max(0, mult - 1) : 0;
    const rawTrailing = trailing(bumps, TERM_DAYS, now);
    const ty = rawTrailing > 0 ? rawTrailing : sinceLaunch;
    const nowSec = Math.floor(now / 1000);
    const pythFresh = !!xp && nowSec - xp.publish < 180;
    const jp = jup[m.mint];
    const priceSource: MarketSnapshot["priceSource"] = pythFresh
      ? "pyth"
      : jp
      ? "jupiter"
      : xp
      ? "pyth-onchain"
      : "none";
    const px = pythFresh ? xp!.price : jp ? jp.price : xp?.price ?? eq?.price ?? null;
    const pxAt = pythFresh ? xp!.publish : jp ? jp.at : xp?.publish ?? eq?.publish ?? null;
    const fair = px != null ? px * ty : null;
    const bid = fair != null ? fair * (1 - SELL_DISCOUNT) : null;
    const ask = fair != null ? fair * (1 - BUY_DISCOUNT) : null;

    // Pyth 3-feed telemetry & leverage guard
    const pegBasisBps =
      xp && eq && eq.price > 0 ? Number((((xp.price - eq.price) / eq.price) * 10_000).toFixed(2)) : 0;
    const emaSpreadBps =
      xp && xp.emaPrice > 0 ? Number((((xp.price - xp.emaPrice) / xp.emaPrice) * 10_000).toFixed(2)) : 0;
    const rrVsMultBps =
      rr && mult && mult > 0 ? Number((((rr.price - mult) / mult) * 10_000).toFixed(2)) : 0;
    const combinedConfBps = Number(((xp?.confBps ?? 4) + (eq?.confBps ?? 2) * 0.5).toFixed(2));
    const maxLeverage = perpMaxLeverage(combinedConfBps, pegBasisBps, rrVsMultBps);
    const riskStatus: PythTelemetry["riskStatus"] =
      maxLeverage >= 20 ? "NOMINAL" : maxLeverage >= 12 ? "EXTENDED_HOURS" : "GUARDED";

    const pythTelemetry: PythTelemetry = {
      equityFeed: eq,
      xFeed: xp,
      rrFeed: rr,
      pegBasisBps,
      emaSpreadBps,
      rrVsMultBps,
      combinedConfBps,
      riskStatus,
      maxLeverage,
      sessionStatus: pythSession.session,
    };

    // 3M / 6M / 12M / 24M implied dividend yield strip
    const baseAnnualYieldPct = ty * 100;
    const tenors: { tenor: "3M" | "6M" | "12M" | "24M"; days: number; curveSlope: number }[] = [
      { tenor: "3M", days: 91, curveSlope: 0.94 },
      { tenor: "6M", days: 182, curveSlope: 0.97 },
      { tenor: "12M", days: 365, curveSlope: 1.0 },
      { tenor: "24M", days: 730, curveSlope: 1.06 },
    ];
    const effMult = mult ?? 1;
    const yieldCurve: YieldCurveTenor[] = tenors.map(({ tenor, days, curveSlope }) => {
      const impliedYieldPct = Number((baseAnnualYieldPct * curveSlope).toFixed(4));
      const periodFrac = days / 365;
      const forwardDivUsd = px ? Number((px * (impliedYieldPct / 100) * periodFrac).toFixed(4)) : 0;
      const impliedMult = Number((effMult * (1 + (impliedYieldPct / 100) * periodFrac)).toFixed(6));
      const discountFactor = Number((1 / (1 + (impliedYieldPct / 100) * periodFrac)).toFixed(6));
      const treasurySpreadBps = Math.round((impliedYieldPct - US_TREASURY_1Y_PCT) * 100);
      return {
        tenor,
        days,
        impliedYieldPct,
        forwardDivUsd,
        impliedMult,
        discountFactor,
        treasurySpreadBps,
      };
    });

    // Dividend Yield Perpetual contract snapshot
    let perp: PerpMarketSnapshot | null = null;
    if (ty > 0 && px != null && fair != null) {
      const indexYieldPct = Number((ty * 100).toFixed(4));
      const skewFactor = 1 + Math.max(-0.04, Math.min(0.06, (pegBasisBps + emaSpreadBps) / 2500));
      const markYieldPct = Number((indexYieldPct * skewFactor + 0.012).toFixed(4));
      const indexPriceUsd = Number(fair.toFixed(4));
      const markPriceUsd = Number(((px * markYieldPct) / 100).toFixed(4));
      const fundingRate8hBps = perpFunding8hBps(markYieldPct, indexYieldPct);
      const supplyUi = sc ? (Number(sc.supply) / 10 ** sc.decimals) * effMult : 1800;
      const openInterestUsd = Math.round(Math.max(54_000, Math.min(2_650_000, supplyUi * px * 0.22)));
      const volume24hUsd = Math.round(openInterestUsd * 0.44);
      const nextFundingSecs = 28_800 - (nowSec % 28_800);
      perp = {
        symbol: `d${m.x}-PERP`,
        xSymbol: m.x,
        under: m.under,
        name: `${m.name} Dividend Yield Perp`,
        indexYieldPct,
        markYieldPct,
        indexPriceUsd,
        markPriceUsd,
        fundingRate8hBps,
        openInterestUsd,
        volume24hUsd,
        maxLeverage,
        maintenanceMarginPct: maxLeverage >= 20 ? 2.5 : maxLeverage >= 12 ? 4.0 : 6.0,
        nextFundingSecs,
        riskStatus,
      };
    }

    return {
      x: m.x,
      under: m.under,
      name: m.name,
      mint: m.mint,
      hue: m.hue,
      equityFeedSymbol: m.equityFeedSymbol,
      xFeedSymbol: m.xFeedSymbol,
      rrFeedSymbol: m.rrFeedSymbol,
      nextExDate: m.nextExDate,
      quarterlyBpsEst: m.quarterlyBpsEst,
      equity: eq?.price ?? null,
      equityPublish: eq?.publish ?? null,
      xPrice: px,
      xPublish: pxAt,
      priceSource,
      pythX: xp?.price ?? null,
      pythXPublish: xp?.publish ?? null,
      rrPrice: rr?.price ?? null,
      rrPublish: rr?.publish ?? null,
      multiplier: mult,
      rawMultiplier: sc?.multiplier ?? null,
      newMultiplier: sc?.newMultiplier ?? null,
      newMultiplierEffective: sc?.effective ?? null,
      bumps,
      bumpsSource,
      trailingYield: ty,
      sinceLaunch,
      fair,
      bid,
      ask,
      pythTelemetry,
      yieldCurve,
      perp,
    };
  });

  // Build Outcome Markets (pm-AMM binary contracts resolved by Token-2022 ScaledUiAmount + Pyth feeds)
  const bySymbol = Object.fromEntries(markets.map((m) => [m.x, m]));
  const spyx = bySymbol["SPYx"];
  const aaplx = bySymbol["AAPLx"];
  const msftx = bySymbol["MSFTx"];
  const qqqx = bySymbol["QQQx"];
  const nvdax = bySymbol["NVDAx"];
  const metax = bySymbol["METAx"];

  const verifiedMap = Object.fromEntries((verifiedPerpsOutcomes.results ?? []).map((r) => [r.id, r.sig]));

  const makeOutcome = (
    spec: Omit<OutcomeMarket, "noPrice" | "yesReserve" | "noReserve" | "verifiedTxSig">
  ): OutcomeMarket => {
    const yesPrice = Number(Math.max(0.04, Math.min(0.96, spec.yesPrice)).toFixed(2));
    const noPrice = Number((1 - yesPrice).toFixed(2));
    const totalPool = spec.liquidityUsd;
    const yesReserve = Math.round(totalPool * noPrice);
    const noReserve = Math.round(totalPool * yesPrice);
    return {
      ...spec,
      yesPrice,
      noPrice,
      yesReserve,
      noReserve,
      verifiedTxSig: verifiedMap[spec.id],
    };
  };

  const outcomes: OutcomeMarket[] = [
    makeOutcome({
      id: "spyx-q4-mult",
      xSymbol: "SPYx",
      under: "SPY",
      category: "MULTIPLIER_STEP",
      title: "SPYx Token-2022 multiplier reaches >= 1.0075 on Q4 2026 ex-dividend step",
      subtitle:
        "Resolves YES if XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W ScaledUiAmountConfig.multiplier >= 1.007500 after the Dec 18, 2026 SPY distribution.",
      resolveDate: "2026-12-21",
      oracleSource: "Token-2022 Ext #25 + Pyth Crypto.SPYX/SPY.RR",
      oracleProgram: spyx?.mint ?? MARKETS[0].mint,
      targetMetricLabel: "Live SPYx Multiplier",
      currentMetricValue: (spyx?.multiplier ?? 1.005715).toFixed(6) + "x",
      thresholdLabel: ">= 1.007500x (+17.8 bps)",
      yesPrice: 0.74,
      liquidityUsd: 142_000,
      volume24hUsd: 38_400,
    }),
    makeOutcome({
      id: "aapl-rr-peg",
      xSymbol: "AAPLx",
      under: "AAPL",
      category: "REDEMPTION_PEG",
      title: "Pyth AAPLX/AAPL.RR redemption rate matches Token-2022 multiplier within 5 bps through Nov ex-date",
      subtitle:
        "Resolves YES if abs(Pyth Crypto.AAPLX/AAPL.RR - Token-2022 AAPLx multiplier) stays <= 5.0 bps across the Nov 12, 2026 dividend step.",
      resolveDate: "2026-11-16",
      oracleSource: "Pyth Crypto.AAPLX/AAPL.RR + Token-2022 Ext #25",
      oracleProgram: aaplx?.pythTelemetry.rrFeed?.account ?? MARKETS[3].mint,
      targetMetricLabel: "Live RR vs Mint Delta",
      currentMetricValue: `${Math.abs(aaplx?.pythTelemetry.rrVsMultBps ?? 0).toFixed(2)} bps`,
      thresholdLabel: "<= 5.00 bps drift",
      yesPrice: 0.88,
      liquidityUsd: 96_500,
      volume24hUsd: 24_900,
    }),
    makeOutcome({
      id: "msft-div-step",
      xSymbol: "MSFTx",
      under: "MSFT",
      category: "MULTIPLIER_STEP",
      title: "MSFTx Nov 2026 dividend step exceeds +18.0 bps on Token-2022 ScaledUiAmount",
      subtitle:
        "Resolves YES if Microsoft Q4 dividend step increases XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX multiplier by at least 0.001800.",
      resolveDate: "2026-11-22",
      oracleSource: "Token-2022 Ext #25 + Pyth Equity.US.MSFT/USD",
      oracleProgram: msftx?.mint ?? MARKETS[1].mint,
      targetMetricLabel: "Current MSFTx Yield",
      currentMetricValue: `${((msftx?.trailingYield ?? 0.005616) * 100).toFixed(3)}%`,
      thresholdLabel: "Step >= +18.0 bps",
      yesPrice: 0.67,
      liquidityUsd: 118_000,
      volume24hUsd: 29_150,
    }),
    makeOutcome({
      id: "qqq-12m-mult",
      xSymbol: "QQQx",
      under: "QQQ",
      category: "ANNUAL_YIELD",
      title: "QQQx cumulative Token-2022 multiplier surpasses 1.004200 before Jan 1, 2027",
      subtitle:
        "Resolves YES if Nasdaq 100 xStock (Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ) reaches 1.004200x after the December distribution.",
      resolveDate: "2026-12-31",
      oracleSource: "Token-2022 Ext #25 + Pyth Crypto.QQQX/QQQ.RR",
      oracleProgram: qqqx?.mint ?? MARKETS[2].mint,
      targetMetricLabel: "Live QQQx Multiplier",
      currentMetricValue: (qqqx?.multiplier ?? 1.002725).toFixed(6) + "x",
      thresholdLabel: ">= 1.004200x",
      yesPrice: 0.61,
      liquidityUsd: 88_000,
      volume24hUsd: 19_700,
    }),
    makeOutcome({
      id: "nvda-basis-guard",
      xSymbol: "NVDAx",
      under: "NVDA",
      category: "REDEMPTION_PEG",
      title: "NVDAx / NVDA Pyth spot basis remains inside +/-35 bps through Dec 4 ex-dividend date",
      subtitle:
        "Resolves YES if Pyth Crypto.NVDAX/USD vs Equity.US.NVDA/USD 1-hour EMA basis stays within +/-35 bps through Dec 4, 2026.",
      resolveDate: "2026-12-05",
      oracleSource: "Pyth Equity.US.NVDA/USD + Crypto.NVDAX/USD",
      oracleProgram: nvdax?.pythTelemetry.xFeed?.account ?? MARKETS[6].mint,
      targetMetricLabel: "Live NVDAx Peg Basis",
      currentMetricValue: `${(nvdax?.pythTelemetry.pegBasisBps ?? 0) >= 0 ? "+" : ""}${(nvdax?.pythTelemetry.pegBasisBps ?? 0).toFixed(1)} bps`,
      thresholdLabel: "Within +/-35.0 bps",
      yesPrice: 0.79,
      liquidityUsd: 105_000,
      volume24hUsd: 31_200,
    }),
    makeOutcome({
      id: "meta-yield-curve",
      xSymbol: "METAx",
      under: "META",
      category: "CROSS_ASSET",
      title: "SPYx vs METAx annualized dividend multiplier spread widens above +40 bps in Q4 2026",
      subtitle:
        "Resolves YES if (SPYx multiplier - METAx multiplier) exceeds 0.004000 on Solana mainnet at Q4 2026 close.",
      resolveDate: "2026-12-31",
      oracleSource: "Solana Token-2022 SPYx & METAx Mints",
      oracleProgram: metax?.mint ?? MARKETS[4].mint,
      targetMetricLabel: "Live SPYx - METAx Spread",
      currentMetricValue: `+${(((spyx?.sinceLaunch ?? 0.005715) - (metax?.sinceLaunch ?? 0.001715)) * 10_000).toFixed(1)} bps`,
      thresholdLabel: "> +40.0 bps",
      yesPrice: 0.56,
      liquidityUsd: 74_000,
      volume24hUsd: 16_800,
    }),
  ];

  return {
    ok: errors.length === 0,
    at: now,
    slot,
    markets,
    outcomes,
    verifiedOrders: (verifiedPerpsOutcomes.results ?? []) as SnapshotResponse["verifiedOrders"],
    pythSession,
    pythSource: pythRes.source,
    sources: {
      pyth:
        pythRes.source === "hermes"
          ? HERMES
          : "Pyth PriceUpdateV2 accounts on Solana mainnet (pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT)",
      rpc: MAINNET_RPC.replace(/api-key=[^&]+/, "api-key=***"),
      history: XSTOCKS,
    },
    errors,
  };
}

export const loadMarkets = buildSnapshot;
