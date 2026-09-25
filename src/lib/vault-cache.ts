import "server-only";
import { Connection } from "@solana/web3.js";
import { CouponVault } from "./vault/sdk";
import { DEPLOYMENT, RPC_URL } from "./vault/deployment";
import { marketKeys, parseMarkets, type ChainMarket } from "./vault/chain-markets";

// Server side cache of devnet pool reserves and vault markets, embedded in the HTML for first paint.
let last: { at: number; data: Record<string, ChainMarket> } | null = null;
let inflight: Promise<Record<string, ChainMarket> | null> | null = null;

async function read(): Promise<Record<string, ChainMarket> | null> {
  if (!DEPLOYMENT) return null;
  const vault = new CouponVault(DEPLOYMENT);
  const conn = new Connection(process.env.DEVNET_RPC || RPC_URL, "confirmed");
  const keys = marketKeys(vault);
  const infos: (Uint8Array | undefined)[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const r = await conn.getMultipleAccountsInfo(keys.slice(i, i + 100), "confirmed");
    infos.push(...r.map((a) => (a ? new Uint8Array(a.data) : undefined)));
  }
  return parseMarkets(vault, infos);
}

/** Last good devnet market read; never waits more than `waitMs` on a cold cache. */
export async function getChainMarketsFast(waitMs = 3000): Promise<Record<string, ChainMarket> | null> {
  const refresh = () => {
    if (!inflight) inflight = read().then((d) => { if (d) last = { at: Date.now(), data: d }; return d; }).catch(() => null).finally(() => { inflight = null; });
    return inflight;
  };
  if (last) {
    if (Date.now() - last.at > 15_000) refresh();
    return last.data;
  }
  return Promise.race([refresh(), new Promise<null>((r) => setTimeout(() => r(null), waitMs))]);
}
