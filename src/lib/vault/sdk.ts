// Client SDK for the coupon_vault program. Used by the app (wallet adapter) and by the
// devnet setup and verification scripts, so both run the exact same instruction builders.
import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

export const TOKEN_2022 = TOKEN_2022_PROGRAM_ID;
export const X_DECIMALS = 8;
export const USDC_DECIMALS = 6;
export const FEE_BPS = 30;
export const FAUCET_COOLDOWN = 3600; // coupon_faucet, test only
export const FAUCET_X = 100;
export const FAUCET_USDC = 1000;

export type MarketDeployment = {
  symbol: string; // mainnet xStock symbol this mock mirrors, e.g. SPYx
  xMint: string;
  pMint: string;
  dMint: string;
  lpMint: string | null; // null when the asset paid no dividend in 12 months, so no coupon pool
  mainnetMint: string;
  multiplier: number; // mainnet multiplier mirrored at setup
};
export type Deployment = {
  cluster: "devnet" | "localnet";
  programs: { vault: string; market: string; faucet: string };
  admin: string;
  usdcMint: string;
  markets: MarketDeployment[];
};

export const VaultIx = { InitConfig: 0, InitMarket: 1, Split: 3, Recombine: 4, Claim: 5, Redeem: 6, Bump: 9 } as const;
export const MarketIx = { InitConfig: 0, InitPool: 1, SwapSell: 2, SwapBuy: 3, AddLiquidity: 4, RemoveLiquidity: 5 } as const;
export const FaucetIx = { InitConfig: 0, Drip: 1, AdminMint: 2 } as const;

// Custom error codes shared by all three programs (coupon_common::CouponError).
export const ERRORS: Record<number, string> = {
  1: "Account mismatch. Refresh and try again.",
  2: "Not authorized for this action.",
  3: "Math overflow.",
  4: "Faucet cooldown: one claim per token per hour.",
  5: "Coupon matured. This market no longer accepts new positions.",
  6: "Not matured yet. Shares redeem after the 12 month maturity.",
  7: "Enter an amount above zero.",
  8: "This mint has no ScaledUiAmount multiplier.",
  9: "Insufficient balance.",
  10: "Malformed instruction.",
  11: "Slippage exceeded. The pool moved; try again or widen tolerance.",
  12: "This coupon has no liquidity pool yet.",
  13: "Not a genuine coupon_vault coupon.",
  14: "Already initialized.",
};

export function errorCode(e: unknown): number | null {
  const s = String((e as { message?: string })?.message ?? e) + JSON.stringify((e as { logs?: string[] })?.logs ?? "");
  const m = s.match(/custom program error: 0x([0-9a-f]+)/i);
  if (m) return parseInt(m[1], 16);
  const n = s.match(/"Custom":\s*(\d+)/);
  return n ? Number(n[1]) : null;
}
export function explainError(e: unknown): string {
  const s = String((e as { message?: string })?.message ?? e);
  const code = errorCode(e);
  if (code != null && ERRORS[code]) return ERRORS[code];
  if (/insufficient lamports|insufficient funds for fee|Attempt to debit an account but found no record/i.test(s))
    return "This wallet needs devnet SOL for fees. Get some at faucet.solana.com.";
  if (/User rejected/i.test(s)) return "Signature request was rejected in the wallet.";
  return s.length > 180 ? s.slice(0, 180) + "…" : s;
}

const u64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};
const i64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(n);
  return b;
};
const f64 = (n: number) => {
  const b = Buffer.alloc(8);
  b.writeDoubleLE(n);
  return b;
};
const W = (pubkey: PublicKey, isWritable = true): AccountMeta => ({ pubkey, isSigner: false, isWritable });
const R = (pubkey: PublicKey) => W(pubkey, false);
const S = (pubkey: PublicKey, isWritable = true): AccountMeta => ({ pubkey, isSigner: true, isWritable });

/** Client for the three COUPON programs: coupon_vault, coupon_market and the test only coupon_faucet. */
export class CouponVault {
  readonly vaultId: PublicKey;
  readonly marketId: PublicKey;
  readonly faucetId: PublicKey;
  readonly usdc: PublicKey;
  constructor(readonly dep: Deployment) {
    this.vaultId = new PublicKey(dep.programs.vault);
    this.marketId = new PublicKey(dep.programs.market);
    this.faucetId = new PublicKey(dep.programs.faucet);
    this.usdc = new PublicKey(dep.usdcMint);
  }
  /** kept for older call sites */
  get programId() {
    return this.vaultId;
  }
  private pda(seeds: (Buffer | Uint8Array)[], pid: PublicKey) {
    return PublicKey.findProgramAddressSync(seeds, pid)[0];
  }
  get config() {
    return this.pda([Buffer.from("config")], this.vaultId);
  }
  get auth() {
    return this.pda([Buffer.from("auth")], this.vaultId);
  }
  get marketConfig() {
    return this.pda([Buffer.from("config")], this.marketId);
  }
  get faucetConfig() {
    return this.pda([Buffer.from("config")], this.faucetId);
  }
  get faucetAuth() {
    return this.pda([Buffer.from("faucet")], this.faucetId);
  }
  market(x: PublicKey) {
    return this.pda([Buffer.from("market"), x.toBuffer()], this.vaultId);
  }
  pos(market: PublicKey, owner: PublicKey) {
    return this.pda([Buffer.from("pos"), market.toBuffer(), owner.toBuffer()], this.vaultId);
  }
  pool(d: PublicKey) {
    return this.pda([Buffer.from("pool"), d.toBuffer()], this.marketId);
  }
  drip(mint: PublicKey, owner: PublicKey) {
    return this.pda([Buffer.from("drip"), mint.toBuffer(), owner.toBuffer()], this.faucetId);
  }
  ata(mint: PublicKey, owner: PublicKey) {
    return getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022, ASSOCIATED_TOKEN_PROGRAM_ID);
  }
  ensureAta(payer: PublicKey, mint: PublicKey, owner: PublicKey) {
    return createAssociatedTokenAccountIdempotentInstruction(payer, this.ata(mint, owner), owner, mint, TOKEN_2022, ASSOCIATED_TOKEN_PROGRAM_ID);
  }
  find(symbol: string) {
    const m = this.dep.markets.find((k) => k.symbol === symbol);
    if (!m) throw new Error(`No devnet market for ${symbol}`);
    return m;
  }
  keys(m: MarketDeployment) {
    const x = new PublicKey(m.xMint), p = new PublicKey(m.pMint), d = new PublicKey(m.dMint);
    const lp = m.lpMint ? new PublicKey(m.lpMint) : null;
    const market = this.market(x);
    const pool = this.pool(d);
    return { x, p, d, lp, market, pool };
  }
  private ix(pid: PublicKey, data: Buffer, keys: AccountMeta[]) {
    return new TransactionInstruction({ programId: pid, keys, data });
  }

  // ---------- coupon_faucet (test only) ----------
  faucet(user: PublicKey, mint: PublicKey): TransactionInstruction[] {
    return [
      this.ensureAta(user, mint, user),
      this.ix(this.faucetId, Buffer.from([FaucetIx.Drip]), [S(user), R(this.faucetConfig), W(this.drip(mint, user)), W(mint), W(this.ata(mint, user)), R(this.faucetAuth), R(TOKEN_2022), R(SystemProgram.programId)]),
    ];
  }

  // ---------- coupon_vault ----------
  private vaultPositionKeys(user: PublicKey, m: MarketDeployment) {
    const k = this.keys(m);
    return [S(user), R(this.config), W(k.market), W(this.pos(k.market, user)), R(k.x), W(k.p), W(k.d), W(this.ata(k.x, user)), W(this.ata(k.p, user)), W(this.ata(k.d, user)), W(this.ata(k.x, this.auth)), R(this.auth), R(TOKEN_2022), R(SystemProgram.programId)];
  }
  private userAtas(user: PublicKey, mints: (PublicKey | null)[]) {
    return mints.filter((x): x is PublicKey => !!x).map((mint) => this.ensureAta(user, mint, user));
  }
  private vaultIx(user: PublicKey, m: MarketDeployment, tag: number, raw: bigint) {
    const k = this.keys(m);
    return [...this.userAtas(user, [k.x, k.p, k.d]), this.ix(this.vaultId, Buffer.concat([Buffer.from([tag]), u64(raw)]), this.vaultPositionKeys(user, m))];
  }
  split(user: PublicKey, m: MarketDeployment, raw: bigint) {
    return this.vaultIx(user, m, VaultIx.Split, raw);
  }
  recombine(user: PublicKey, m: MarketDeployment, raw: bigint) {
    return this.vaultIx(user, m, VaultIx.Recombine, raw);
  }
  redeem(user: PublicKey, m: MarketDeployment, raw: bigint) {
    return this.vaultIx(user, m, VaultIx.Redeem, raw);
  }
  claim(user: PublicKey, m: MarketDeployment) {
    const k = this.keys(m);
    return [
      ...this.userAtas(user, [k.x, k.d]),
      this.ix(this.vaultId, Buffer.from([VaultIx.Claim]), [S(user), R(this.config), W(k.market), W(this.pos(k.market, user)), R(k.x), R(k.p), R(k.d), W(this.ata(k.x, user)), R(this.ata(k.d, user)), W(this.ata(k.x, this.auth)), R(this.auth), R(TOKEN_2022), R(SystemProgram.programId)]),
    ];
  }

  // ---------- coupon_market ----------
  tradeKeys(user: PublicKey, m: MarketDeployment) {
    const k = this.keys(m);
    if (!k.lp) throw new Error(`${m.symbol} has no pool`);
    return [
      S(user), R(this.marketConfig), W(k.pool), R(k.d), R(this.usdc), W(this.ata(k.d, k.pool)), W(this.ata(this.usdc, k.pool)), W(k.lp),
      W(this.ata(k.d, user)), W(this.ata(this.usdc, user)), W(this.ata(k.lp, user)), R(TOKEN_2022), R(SystemProgram.programId), R(this.vaultId),
      R(this.config), W(k.market), W(this.pos(k.market, user)), R(k.x), R(k.p), W(this.ata(k.x, user)), W(this.ata(k.x, this.auth)), R(this.auth),
    ];
  }
  private tradeIx(user: PublicKey, m: MarketDeployment, tag: number, args: bigint[]) {
    const k = this.keys(m);
    return [...this.userAtas(user, [k.x, k.d, this.usdc, k.lp]), this.ix(this.marketId, Buffer.concat([Buffer.from([tag]), ...args.map(u64)]), this.tradeKeys(user, m))];
  }
  swapSell(user: PublicKey, m: MarketDeployment, dIn: bigint, minUsdcOut: bigint) {
    return this.tradeIx(user, m, MarketIx.SwapSell, [dIn, minUsdcOut]);
  }
  swapBuy(user: PublicKey, m: MarketDeployment, usdcIn: bigint, minDOut: bigint) {
    return this.tradeIx(user, m, MarketIx.SwapBuy, [usdcIn, minDOut]);
  }
  addLiquidity(user: PublicKey, m: MarketDeployment, dIn: bigint, usdcMax: bigint, minLp: bigint) {
    return this.tradeIx(user, m, MarketIx.AddLiquidity, [dIn, usdcMax, minLp]);
  }
  removeLiquidity(user: PublicKey, m: MarketDeployment, lp: bigint, minD: bigint, minUsdc: bigint) {
    return this.tradeIx(user, m, MarketIx.RemoveLiquidity, [lp, minD, minUsdc]);
  }

  // ---------- admin (config, markets, pools, bump replay, seed mint) ----------
  initVaultConfig(admin: PublicKey) {
    return this.ix(this.vaultId, Buffer.from([VaultIx.InitConfig]), [S(admin), W(this.config), R(SystemProgram.programId)]);
  }
  initMarketConfig(admin: PublicKey) {
    return this.ix(this.marketId, Buffer.from([MarketIx.InitConfig]), [S(admin), W(this.marketConfig), R(this.usdc), R(SystemProgram.programId)]);
  }
  initFaucetConfig(admin: PublicKey) {
    return this.ix(this.faucetId, Buffer.from([FaucetIx.InitConfig]), [S(admin), W(this.faucetConfig), R(SystemProgram.programId)]);
  }
  initMarket(admin: PublicKey, m: MarketDeployment, fairMicro: bigint, maturitySecs: bigint) {
    const k = this.keys(m);
    return this.ix(this.vaultId, Buffer.concat([Buffer.from([VaultIx.InitMarket]), u64(fairMicro), i64(maturitySecs)]), [S(admin), R(this.config), W(k.market), R(k.x), R(k.p), R(k.d), R(SystemProgram.programId)]);
  }
  /** Opens a pool. `dMint` and `vaultMarket` are explicit so tests can try a fake coupon. */
  initPool(admin: PublicKey, dMint: PublicKey, lpMint: PublicKey, vaultMarket: PublicKey, dRaw: bigint, usdcRaw: bigint) {
    const pool = this.pool(dMint);
    return [
      this.ensureAta(admin, dMint, pool),
      this.ensureAta(admin, this.usdc, pool),
      this.ensureAta(admin, lpMint, admin),
      this.ix(this.marketId, Buffer.concat([Buffer.from([MarketIx.InitPool]), u64(dRaw), u64(usdcRaw)]), [
        S(admin), R(this.marketConfig), R(vaultMarket), R(dMint), R(this.usdc), W(pool), W(this.ata(dMint, pool)), W(this.ata(this.usdc, pool)), W(lpMint),
        W(this.ata(dMint, admin)), W(this.ata(this.usdc, admin)), W(this.ata(lpMint, admin)), R(TOKEN_2022), R(SystemProgram.programId),
      ]),
    ];
  }
  bump(admin: PublicKey, m: MarketDeployment, newMultiplier: number) {
    const k = this.keys(m);
    return this.ix(this.vaultId, Buffer.concat([Buffer.from([VaultIx.Bump]), f64(newMultiplier)]), [S(admin, false), R(this.config), R(k.market), W(k.x), R(this.auth), R(TOKEN_2022)]);
  }
  adminMint(admin: PublicKey, mint: PublicKey, dst: PublicKey, raw: bigint) {
    return this.ix(this.faucetId, Buffer.concat([Buffer.from([FaucetIx.AdminMint]), u64(raw)]), [S(admin, false), R(this.faucetConfig), W(mint), W(dst), R(this.faucetAuth), R(TOKEN_2022)]);
  }

  // ---------- reads ----------
  async readMarket(conn: Connection, m: MarketDeployment) {
    const k = this.keys(m);
    const [mk, xMint, pd, pu, lpMint] = await conn.getMultipleAccountsInfo([k.market, k.x, this.ata(k.d, k.pool), this.ata(this.usdc, k.pool), k.lp ?? k.d]);
    const d = mk?.data;
    const m12 = (v: bigint) => Number(v) / 1e12;
    return {
      exists: !!d,
      mBase: d ? m12(d.readBigUInt64LE(104)) : null,
      mFinal: d ? m12(d.readBigUInt64LE(112)) : null,
      start: d ? Number(d.readBigInt64LE(120)) : null,
      maturity: d ? Number(d.readBigInt64LE(128)) : null,
      seedFairMicro: d ? Number(d.readBigUInt64LE(136)) : null,
      multiplier: xMint ? readScaledMultiplier(xMint.data) : null,
      reserveD: pd ? pd.data.readBigUInt64LE(64) : 0n,
      reserveUsdc: pu ? pu.data.readBigUInt64LE(64) : 0n,
      lpSupply: k.lp && lpMint ? lpMint.data.readBigUInt64LE(36) : 0n,
    };
  }
  async readPosition(conn: Connection, m: MarketDeployment, owner: PublicKey) {
    const k = this.keys(m);
    const accts = [this.ata(k.x, owner), this.ata(k.p, owner), this.ata(k.d, owner), this.ata(this.usdc, owner), k.lp ? this.ata(k.lp, owner) : this.ata(k.d, owner), this.pos(k.market, owner)];
    const r = await conn.getMultipleAccountsInfo(accts);
    const bal = (i: number) => (r[i] && r[i]!.data.length >= 72 ? r[i]!.data.readBigUInt64LE(64) : 0n);
    return { x: bal(0), p: bal(1), d: bal(2), usdc: bal(3), lp: k.lp ? bal(4) : 0n, snap: r[5] ? Number(r[5].data.readBigUInt64LE(8)) / 1e12 : null };
  }
  async readDrip(conn: Connection, mint: PublicKey, owner: PublicKey) {
    const a = await conn.getAccountInfo(this.drip(mint, owner));
    return a ? Number(a.data.readBigInt64LE(8)) : null;
  }
}

/** Effective ScaledUiAmount multiplier from raw Token-2022 mint data (extension type 25). */
export function readScaledMultiplier(data: Buffer, now = Date.now() / 1000): number | null {
  if (data.length < 166 || data[165] !== 1) return null;
  let o = 166;
  while (o + 4 <= data.length) {
    const t = data.readUInt16LE(o), l = data.readUInt16LE(o + 2);
    o += 4;
    if (t === 25 && l >= 56) {
      const cur = data.readDoubleLE(o + 32), ts = Number(data.readBigInt64LE(o + 40)), next = data.readDoubleLE(o + 48);
      return ts !== 0 && now >= ts ? next : cur;
    }
    if (t === 0) break;
    o += l;
  }
  return null;
}

// ---------- pure math mirrors of the program (for quotes in the UI) ----------
export function swapOut(amountIn: bigint, rIn: bigint, rOut: bigint): bigint {
  if (rIn === 0n || rOut === 0n) return 0n;
  const inFee = amountIn * BigInt(10_000 - FEE_BPS);
  return (inFee * rOut) / (rIn * 10_000n + inFee);
}
export function couponClaim(d: bigint, mBase: number, snap: number, m: number): bigint {
  const b = BigInt(Math.floor(mBase * 1e12)), s = BigInt(Math.floor(snap * 1e12)), n = BigInt(Math.floor(m * 1e12));
  if (n <= s || d === 0n) return 0n;
  return (((d * b) / s) * (n - s)) / n;
}
export function shareValue(amount: bigint, mBase: number, m: number): bigint {
  return (amount * BigInt(Math.floor(mBase * 1e12))) / BigInt(Math.floor(m * 1e12));
}
export const toRaw = (ui: number, dec: number) => BigInt(Math.round(ui * 10 ** dec));
export const fromRaw = (raw: bigint, dec: number) => Number(raw) / 10 ** dec;
