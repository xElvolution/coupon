import { Buffer } from "buffer";
import { CouponVault, X_DECIMALS, USDC_DECIMALS, fromRaw, readScaledMultiplier, type MarketDeployment } from "./sdk";

// Market level chain state (vault market, test mint multiplier, d and p pool reserves), read the
// same way in the browser (useVault) and on the server (vault-cache, server rendered first paint).
export type ChainMarket = {
  symbol: string;
  dep: MarketDeployment;
  exists: boolean;
  multiplier: number | null;
  mBase: number | null;
  maturity: number | null;
  reserveD: bigint;
  reserveUsdc: bigint;
  lpSupply: bigint;
  hasPool: boolean;
  /** pool mid price in USDC per coupon */
  poolPrice: number | null;
  /** share (p) pool */
  reserveP: bigint;
  reservePUsdc: bigint;
  hasPPool: boolean;
  pPoolPrice: number | null;
};

export const MK = 7; // market level accounts read per market
const u64At = (b: Uint8Array | undefined, o: number) => (b && b.length >= o + 8 ? Buffer.from(b).readBigUInt64LE(o) : 0n);

export function marketKeys(vault: CouponVault) {
  return vault.dep.markets.flatMap((m) => {
    const k = vault.keys(m);
    return [k.market, k.x, vault.ata(k.d, k.pool), vault.ata(vault.usdc, k.pool), k.lp ?? k.d, vault.ata(k.p, k.pPool), vault.ata(vault.usdc, k.pPool)];
  });
}

export function parseMarkets(vault: CouponVault, infos: (Uint8Array | undefined)[]): Record<string, ChainMarket> {
  const nm: Record<string, ChainMarket> = {};
  vault.dep.markets.forEach((m: MarketDeployment, i: number) => {
    const [mk, xm, pd, pu, lp, pp, ppu] = infos.slice(i * MK, i * MK + MK);
    const rd = u64At(pd, 64), ru = u64At(pu, 64);
    const rp = u64At(pp, 64), rpu = u64At(ppu, 64);
    const b = mk ? Buffer.from(mk) : null;
    nm[m.symbol] = {
      symbol: m.symbol,
      dep: m,
      exists: !!b,
      multiplier: xm ? readScaledMultiplier(Buffer.from(xm)) : null,
      mBase: b ? Number(b.readBigUInt64LE(104)) / 1e12 : null,
      maturity: b ? Number(b.readBigInt64LE(128)) : null,
      reserveD: rd,
      reserveUsdc: ru,
      lpSupply: m.lpMint ? u64At(lp, 36) : 0n,
      hasPool: !!m.lpMint && rd > 0n && ru > 0n,
      poolPrice: rd > 0n ? fromRaw(ru, USDC_DECIMALS) / fromRaw(rd, X_DECIMALS) : null,
      reserveP: rp,
      reservePUsdc: rpu,
      hasPPool: !!m.pLpMint && rp > 0n && rpu > 0n,
      pPoolPrice: rp > 0n ? fromRaw(rpu, USDC_DECIMALS) / fromRaw(rp, X_DECIMALS) : null,
    };
  });
  return nm;
}
