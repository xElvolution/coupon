import "server-only";
import { PublicKey } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import { MARKETS, MAINNET_RPC, SELL_DISCOUNT, BUY_DISCOUNT, TERM_DAYS } from "./markets";
import type { Bump, MarketSnapshot, SnapshotResponse } from "./types";

const HERMES = "https://hermes.pyth.network";
const XSTOCKS = "https://api.xstocks.fi/api/v2/public/assets";

interface PythPrice { price: number; publish: number }

const PUSH_ORACLE = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");
const shard0 = Buffer.from([0, 0]);
export const pythAccount = (feedId: string) => PublicKey.findProgramAddressSync([shard0, Buffer.from(feedId, "hex")], PUSH_ORACLE)[0].toBase58();

export type PythSource = "hermes" | "solana-pyth-receiver";

/** Hermes needs an API key now. With PYTH_API_KEY set we stream from Hermes, otherwise we read the Pyth price update accounts on Solana mainnet. */
export async function fetchPyth(ids: string[]): Promise<{ source: PythSource; prices: Record<string, PythPrice> }> {
  const key = process.env.PYTH_API_KEY?.trim() || process.env.HERMES_API_KEY?.trim();
  if (key) {
    try {
      const base = process.env.PYTH_HERMES_URL?.trim() || "https://pyth.dourolabs.app/hermes/v2/updates/price/latest";
      const q = ids.map((i) => `ids[]=${i}`).join("&");
      const r = await fetch(`${base}?${q}&parsed=true`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error(`hermes ${r.status}`);
      const j = await r.json();
      const out: Record<string, PythPrice> = {};
      for (const p of j.parsed ?? []) out[p.id] = { price: Number(p.price.price) * 10 ** p.price.expo, publish: p.price.publish_time };
      if (Object.keys(out).length) return { source: "hermes", prices: out };
    } catch {
      /* fall through to the onchain Pyth accounts */
    }
  }
  const accts = ids.map(pythAccount);
  const j = await getAccounts(accts, "base64");
  const out: Record<string, PythPrice> = {};
  (j.result.value as ({ data: [string, string] } | null)[]).forEach((v, i) => {
    if (!v) return;
    const d = Buffer.from(v.data[0], "base64");
    // PriceUpdateV2: discriminator(8) write_authority(32) verification_level(1|2) feed_id(32) price(i64) conf(u64) expo(i32) publish_time(i64)
    let o = 40;
    o += d[o] === 0 ? 2 : 1;
    const feed = d.subarray(o, o + 32).toString("hex");
    o += 32;
    if (feed !== ids[i]) return;
    const price = Number(d.readBigInt64LE(o));
    const expo = d.readInt32LE(o + 16);
    const publish = Number(d.readBigInt64LE(o + 20));
    out[ids[i]] = { price: price * 10 ** expo, publish };
  });
  return { source: "solana-pyth-receiver", prices: out };
}

const RPCS = [MAINNET_RPC, "https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"].filter((v, i, a) => a.indexOf(v) === i);
/** Sequential getAccountInfo: public endpoints throttle getMultipleAccounts much harder. */
export async function getAccounts(addrs: string[], encoding: "jsonParsed" | "base64") {
  const out: unknown[] = [];
  for (const a of addrs) {
    const j = await rpc("getAccountInfo", [a, { encoding }]);
    out.push(j.result?.value ?? null);
    await new Promise((r) => setTimeout(r, 150));
  }
  return { result: { value: out } };
}

export async function rpc(method: string, params: unknown[]) {
  let last: unknown;
  for (const url of [...RPCS, ...RPCS]) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store", signal: AbortSignal.timeout(7000) });
      if (!r.ok) throw new Error(`rpc ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return { ...j, rpcUrl: url };
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 900));
    }
  }
  throw last;
}

export interface ScaledConfig { multiplier: number; newMultiplier: number; effective: number; authority: string; symbol: string; name: string; supply: string; decimals: number; owner: string }

export async function fetchScaled(mints: string[]): Promise<Record<string, ScaledConfig>> {
  const j = await getAccounts(mints, "jsonParsed");
  const out: Record<string, ScaledConfig> = {};
  (j.result.value as never[]).forEach((v: { owner: string; data: { parsed: { info: { decimals: number; supply: string; extensions: { extension: string; state: Record<string, unknown> }[] } } } } | null, i: number) => {
    if (!v) return;
    const info = v.data.parsed.info;
    const ext = Object.fromEntries(info.extensions.map((e) => [e.extension, e.state]));
    const s = ext.scaledUiAmountConfig as { multiplier: string; newMultiplier: string; newMultiplierEffectiveTimestamp: number; authority: string } | undefined;
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
  });
  return out;
}

export async function fetchHistory(x: string): Promise<Bump[]> {
  const r = await fetch(`${XSTOCKS}/${x}/multiplier/history?network=Solana`, { next: { revalidate: 600 }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`history ${x} ${r.status}`);
  const j = await r.json();
  return (j.nodes ?? [])
    .map((n: { activationDateTime: string; previousMultiplier: number; multiplier: number; reason: string }) => ({ at: n.activationDateTime, prev: Number(n.previousMultiplier), next: Number(n.multiplier), reason: n.reason }))
    .sort((a: Bump, b: Bump) => a.at.localeCompare(b.at));
}

export function effectiveMultiplier(c: ScaledConfig, nowSec = Math.floor(Date.now() / 1000)) {
  return nowSec >= c.effective ? c.newMultiplier : c.multiplier;
}

export function trailing(bumps: Bump[], days = TERM_DAYS, now = Date.now()) {
  const cutoff = now - days * 86400_000;
  return bumps.filter((b) => new Date(b.at).getTime() >= cutoff && new Date(b.at).getTime() <= now).reduce((acc, b) => acc * (b.next / b.prev), 1) - 1;
}

/** Live Solana market price for xStock mints (Jupiter price API, keyless). */
export async function fetchJupiter(mints: string[]): Promise<Record<string, { price: number; at: number }>> {
  const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mints.join(",")}`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`jupiter ${r.status}`);
  const j = await r.json();
  const out: Record<string, { price: number; at: number }> = {};
  for (const m of mints) if (j[m]?.usdPrice) out[m] = { price: Number(j[m].usdPrice), at: Math.floor(Date.now() / 1000) };
  return out;
}

// Keep last good value per source; public RPCs rate limit hard.
// Last good reads also persist to disk so a restart never serves an empty chain view.
const MEMO_FILE = path.join(process.cwd(), ".cache", "memo.json");
const memo = new Map<string, { at: number; v: unknown }>(
  (() => { try { return Object.entries(JSON.parse(fs.readFileSync(MEMO_FILE, "utf8"))) as [string, { at: number; v: unknown }][]; } catch { return []; } })(),
);
function persist() {
  try { fs.mkdirSync(path.dirname(MEMO_FILE), { recursive: true }); fs.writeFileSync(MEMO_FILE, JSON.stringify(Object.fromEntries(memo))); } catch { /* read only fs */ }
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
  const ids = MARKETS.map((m) => m.xFeed); // equity feeds are not used for pricing
  // RPC reads run one after another: public endpoints reject bursts.
  const chainP = (async () => {
    const scaled = await cached("scaled", 60_000, () => fetchScaled(MARKETS.map((m) => m.mint))).catch((e) => { errors.push(String(e)); return {} as Record<string, ScaledConfig>; });
    const pythRes = await cached("pyth", 60_000, () => fetchPyth(ids)).catch((e) => { errors.push(String(e)); return { source: "solana-pyth-receiver" as PythSource, prices: {} as Record<string, PythPrice> }; });
    return { scaled, pythRes };
  })();
  const [{ scaled, pythRes }, histories] = await Promise.all([
    chainP,
    Promise.all(MARKETS.map((m) => cached(`hist:${m.x}`, 600_000, () => fetchHistory(m.x)).catch(() => null))),
  ]);
  const jup = await cached("jup", 8_000, () => fetchJupiter(MARKETS.map((m) => m.mint))).catch((e) => { errors.push(String(e)); return {} as Record<string, { price: number; at: number }>; });
  const pyth = pythRes.prices;
  const now = Date.now();
  const markets: MarketSnapshot[] = MARKETS.map((m, i) => {
    const eq = pyth[m.equityFeed];
    const xp = pyth[m.xFeed];
    const sc = scaled[m.mint];
    let bumps = histories[i] ?? [];
    let bumpsSource: MarketSnapshot["bumpsSource"] = histories[i] ? "xstocks-api" : "chain-only";
    if (!histories[i] && sc && sc.newMultiplier !== sc.multiplier) {
      bumps = [{ at: new Date(sc.effective * 1000).toISOString(), prev: sc.multiplier, next: sc.newMultiplier, reason: "Onchain pending field" }];
      bumpsSource = "chain-only";
    }
    const mult = sc ? effectiveMultiplier(sc) : null;
    const ty = trailing(bumps, TERM_DAYS, now);
    const nowSec = Math.floor(now / 1000);
    const pythFresh = !!xp && nowSec - xp.publish < 180;
    const jp = jup[m.mint];
    const priceSource: MarketSnapshot["priceSource"] = pythFresh ? "pyth" : jp ? "jupiter" : xp ? "pyth-onchain" : "none";
    const px = pythFresh ? xp!.price : jp ? jp.price : xp?.price ?? null;
    const pxAt = pythFresh ? xp!.publish : jp ? jp.at : xp?.publish ?? null;
    const fair = px != null ? px * ty : null;
    return {
      x: m.x, under: m.under, name: m.name, mint: m.mint, hue: m.hue,
      equity: eq?.price ?? null, equityPublish: eq?.publish ?? null,
      xPrice: px, xPublish: pxAt, priceSource,
      pythX: xp?.price ?? null, pythXPublish: xp?.publish ?? null,
      multiplier: mult, rawMultiplier: sc?.multiplier ?? null, newMultiplier: sc?.newMultiplier ?? null, newMultiplierEffective: sc?.effective ?? null,
      bumps, bumpsSource,
      trailingYield: ty,
      sinceLaunch: mult != null ? mult - 1 : 0,
      fair,
      bid: fair != null ? fair * (1 - SELL_DISCOUNT) : null,
      ask: fair != null ? fair * (1 - BUY_DISCOUNT) : null,
    };
  });
  return {
    ok: errors.length === 0,
    at: now,
    markets,
    pythSource: pythRes.source,
    sources: { pyth: pythRes.source === "hermes" ? HERMES : "Pyth price update accounts on Solana mainnet (pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT)", rpc: MAINNET_RPC.replace(/api-key=[^&]+/, "api-key=***"), history: XSTOCKS },
    errors,
  };
}
