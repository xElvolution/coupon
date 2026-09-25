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
export const FAUCET_COOLDOWN = 3600;
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
  programId: string;
  admin: string;
  usdcMint: string;
  markets: MarketDeployment[];
};

export const Ix = {
  InitConfig: 0,
  InitMarket: 1,
  Faucet: 2,
  Split: 3,
  Recombine: 4,
  Claim: 5,
  Redeem: 6,
  SwapSell: 7,
  SwapBuy: 8,
  Bump: 9,
  AdminMint: 11,
  AddLiquidity: 12,
  RemoveLiquidity: 13,
} as const;

// Custom error codes (program enum E, starting at 1) with the message the UI shows.
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
};

export function explainError(e: unknown): string {
  const s = String((e as { message?: string })?.message ?? e);
  const m = s.match(/custom program error: 0x([0-9a-f]+)/i) || s.match(/"Custom":\s*(\d+)/);
  if (m) {
    const code = m[0].includes("0x") ? parseInt(m[1], 16) : Number(m[1]);
    if (ERRORS[code]) return ERRORS[code];
    if (code === 1) return "Insufficient token balance.";
  }
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

export class CouponVault {
  readonly programId: PublicKey;
  readonly usdc: PublicKey;
  constructor(readonly dep: Deployment) {
    this.programId = new PublicKey(dep.programId);
    this.usdc = new PublicKey(dep.usdcMint);
  }
  pda(seeds: (Buffer | Uint8Array)[]) {
    return PublicKey.findProgramAddressSync(seeds, this.programId)[0];
  }
  get config() {
    return this.pda([Buffer.from("config")]);
  }
  get auth() {
    return this.pda([Buffer.from("auth")]);
  }
  market(x: PublicKey) {
    return this.pda([Buffer.from("market"), x.toBuffer()]);
  }
  pool(market: PublicKey) {
    return this.pda([Buffer.from("pool"), market.toBuffer()]);
  }
  pos(market: PublicKey, owner: PublicKey) {
    return this.pda([Buffer.from("pos"), market.toBuffer(), owner.toBuffer()]);
  }
  drip(mint: PublicKey, owner: PublicKey) {
    return this.pda([Buffer.from("drip"), mint.toBuffer(), owner.toBuffer()]);
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
    const pool = this.pool(market);
    return { x, p, d, lp, market, pool };
  }
  private ix(data: Buffer, keys: AccountMeta[]) {
    return new TransactionInstruction({ programId: this.programId, keys, data });
  }

  // ---------- user instructions ----------
  faucet(user: PublicKey, mint: PublicKey, market?: PublicKey): TransactionInstruction[] {
    const keys: AccountMeta[] = [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: this.config, isSigner: false, isWritable: false },
      { pubkey: this.drip(mint, user), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: this.ata(mint, user), isSigner: false, isWritable: true },
      { pubkey: this.auth, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
    if (market) keys.push({ pubkey: market, isSigner: false, isWritable: false });
    return [this.ensureAta(user, mint, user), this.ix(Buffer.from([Ix.Faucet]), keys)];
  }

  /** Shared account list for split, recombine, claim, redeem, swaps and liquidity. */
  positionKeys(user: PublicKey, m: MarketDeployment): AccountMeta[] {
    const k = this.keys(m);
    const lp = k.lp ?? k.d; // placeholder when the market has no pool; the program never reads it then
    const w = (pubkey: PublicKey, isWritable = true): AccountMeta => ({ pubkey, isSigner: false, isWritable });
    return [
      { pubkey: user, isSigner: true, isWritable: true },
      w(this.config, false),
      w(k.market),
      w(this.pos(k.market, user)),
      w(k.x, false),
      w(k.p),
      w(k.d),
      w(this.usdc, false),
      w(this.ata(k.x, user)),
      w(this.ata(k.p, user)),
      w(this.ata(k.d, user)),
      w(this.ata(this.usdc, user)),
      w(this.ata(k.x, this.auth)),
      w(k.pool),
      w(this.ata(k.d, k.pool)),
      w(this.ata(this.usdc, k.pool)),
      w(lp),
      w(this.ata(lp, user)),
      w(this.auth, false),
      w(TOKEN_2022, false),
      w(SystemProgram.programId, false),
    ];
  }
  private positionIx(user: PublicKey, m: MarketDeployment, tag: number, args: bigint[]) {
    const k = this.keys(m);
    const pre = [k.x, k.p, k.d, this.usdc, ...(k.lp ? [k.lp] : [])].map((mint) => this.ensureAta(user, mint, user));
    const data = Buffer.concat([Buffer.from([tag]), ...args.map(u64)]);
    return [...pre, this.ix(data, this.positionKeys(user, m))];
  }
  split(user: PublicKey, m: MarketDeployment, raw: bigint) {
    return this.positionIx(user, m, Ix.Split, [raw]);
  }
  recombine(user: PublicKey, m: MarketDeployment, raw: bigint) {
    return this.positionIx(user, m, Ix.Recombine, [raw]);
  }
  claim(user: PublicKey, m: MarketDeployment) {
    return this.positionIx(user, m, Ix.Claim, []);
  }
  redeem(user: PublicKey, m: MarketDeployment, raw: bigint) {
    return this.positionIx(user, m, Ix.Redeem, [raw]);
  }
  swapSell(user: PublicKey, m: MarketDeployment, dIn: bigint, minUsdcOut: bigint) {
    return this.positionIx(user, m, Ix.SwapSell, [dIn, minUsdcOut]);
  }
  swapBuy(user: PublicKey, m: MarketDeployment, usdcIn: bigint, minDOut: bigint) {
    return this.positionIx(user, m, Ix.SwapBuy, [usdcIn, minDOut]);
  }
  addLiquidity(user: PublicKey, m: MarketDeployment, dIn: bigint, usdcMax: bigint, minLp: bigint) {
    return this.positionIx(user, m, Ix.AddLiquidity, [dIn, usdcMax, minLp]);
  }
  removeLiquidity(user: PublicKey, m: MarketDeployment, lp: bigint, minD: bigint, minUsdc: bigint) {
    return this.positionIx(user, m, Ix.RemoveLiquidity, [lp, minD, minUsdc]);
  }

  // ---------- admin instructions (bump and seeding only) ----------
  initConfig(admin: PublicKey) {
    return this.ix(Buffer.from([Ix.InitConfig]), [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: this.config, isSigner: false, isWritable: true },
      { pubkey: this.usdc, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]);
  }
  initMarket(admin: PublicKey, m: MarketDeployment, fairMicro: bigint, maturitySecs: bigint) {
    const k = this.keys(m);
    return this.ix(Buffer.concat([Buffer.from([Ix.InitMarket]), u64(fairMicro), i64(maturitySecs)]), [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: this.config, isSigner: false, isWritable: false },
      { pubkey: k.market, isSigner: false, isWritable: true },
      { pubkey: k.x, isSigner: false, isWritable: false },
      { pubkey: k.p, isSigner: false, isWritable: false },
      { pubkey: k.d, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]);
  }
  bump(admin: PublicKey, m: MarketDeployment, newMultiplier: number) {
    const k = this.keys(m);
    return this.ix(Buffer.concat([Buffer.from([Ix.Bump]), f64(newMultiplier)]), [
      { pubkey: admin, isSigner: true, isWritable: false },
      { pubkey: this.config, isSigner: false, isWritable: false },
      { pubkey: k.market, isSigner: false, isWritable: false },
      { pubkey: k.x, isSigner: false, isWritable: true },
      { pubkey: this.auth, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022, isSigner: false, isWritable: false },
    ]);
  }
  adminMint(admin: PublicKey, mint: PublicKey, dst: PublicKey, raw: bigint) {
    return this.ix(Buffer.concat([Buffer.from([Ix.AdminMint]), u64(raw)]), [
      { pubkey: admin, isSigner: true, isWritable: false },
      { pubkey: this.config, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: dst, isSigner: false, isWritable: true },
      { pubkey: this.auth, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022, isSigner: false, isWritable: false },
    ]);
  }

  // ---------- reads ----------
  async readMarket(conn: Connection, m: MarketDeployment) {
    const k = this.keys(m);
    const [mk, xMint, pd, pu, lpMint] = await conn.getMultipleAccountsInfo([
      k.market,
      k.x,
      this.ata(k.d, k.pool),
      this.ata(this.usdc, k.pool),
      k.lp ?? k.d,
    ]);
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
    return {
      x: bal(0),
      p: bal(1),
      d: bal(2),
      usdc: bal(3),
      lp: k.lp ? bal(4) : 0n,
      snap: r[5] ? Number(r[5].data.readBigUInt64LE(8)) / 1e12 : null,
    };
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
