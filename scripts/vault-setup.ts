// Deploy-time setup for coupon_vault: creates the devnet test mints (Token-2022 with the
// ScaledUiAmount extension set to each xStock's real mainnet multiplier), test USDC, the
// config, one market per xStock, and a seeded constant product pool per coupon.
// Usage: bun scripts/vault-setup.ts <rpc> <deployment.json> <program id> [markets api]
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, type TransactionInstruction } from "@solana/web3.js";
import { ExtensionType, getMintLen, createInitializeMint2Instruction, createInitializeScaledUiAmountConfigInstruction } from "@solana/spl-token";
import fs from "fs";
import { CouponVault, TOKEN_2022, X_DECIMALS, USDC_DECIMALS, type Deployment, toRaw } from "../src/lib/vault/sdk";

const [rpc, out, programId, api = "http://127.0.0.1:3460/api/markets"] = process.argv.slice(2);
const conn = new Connection(rpc, "confirmed");
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(".keys/deployer.json", "utf8"))));
const SEED_UNITS = 5_000; // xStock units split by the admin to seed each pool
const POOL_UNITS = 4_000; // coupons placed in each pool

const send = async (label: string, ixs: TransactionInstruction[], signers: Keypair[] = []) => {
  for (let i = 0; ; i++) {
    try {
      const sig = await sendAndConfirmTransaction(conn, new Transaction().add(...ixs), [admin, ...signers], { commitment: "confirmed" });
      console.log(label.padEnd(28), sig);
      return sig;
    } catch (e) {
      if (i >= 3) throw e;
      console.log("retry", label, String(e).slice(0, 120));
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
};

const prev: Deployment | null = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : null;
const dep: Deployment = prev ?? { cluster: rpc.includes("devnet") ? "devnet" : "localnet", programId, admin: admin.publicKey.toBase58(), usdcMint: "", markets: [] };
const save = () => fs.writeFileSync(out, JSON.stringify(dep, null, 2) + "\n");

const mkMint = async (label: string, decimals: number, authority: PublicKey, multiplier?: number) => {
  const kp = Keypair.generate();
  const ext = multiplier ? [ExtensionType.ScaledUiAmountConfig] : [];
  const space = getMintLen(ext);
  const ixs: TransactionInstruction[] = [
    SystemProgram.createAccount({ fromPubkey: admin.publicKey, newAccountPubkey: kp.publicKey, space, lamports: await conn.getMinimumBalanceForRentExemption(space), programId: TOKEN_2022 }),
  ];
  if (multiplier) ixs.push(createInitializeScaledUiAmountConfigInstruction(kp.publicKey, authority, multiplier, TOKEN_2022));
  ixs.push(createInitializeMint2Instruction(kp.publicKey, decimals, authority, null, TOKEN_2022));
  await send(`mint ${label}`, ixs, [kp]);
  return kp.publicKey.toBase58();
};

const markets = (await (await fetch(api)).json()).markets as { x: string; mint: string; multiplier: number; fair: number }[];
if (!dep.usdcMint) {
  const v0 = new CouponVault({ ...dep, usdcMint: PublicKey.default.toBase58() });
  dep.usdcMint = await mkMint("USDC (test)", USDC_DECIMALS, v0.auth);
  save();
}
let v = new CouponVault(dep);
if (!(await conn.getAccountInfo(v.config))) await send("init_config", [v.initConfig(admin.publicKey)]);

for (const mk of markets) {
  let m = dep.markets.find((k) => k.symbol === mk.x);
  if (!m) {
    const xMint = await mkMint(`${mk.x} (test)`, X_DECIMALS, v.auth, mk.multiplier);
    const pMint = await mkMint(`p${mk.x}`, X_DECIMALS, v.auth);
    const dMint = await mkMint(`d${mk.x}`, X_DECIMALS, v.auth);
    const market = v.market(new PublicKey(xMint));
    const lpMint = mk.fair > 0 ? await mkMint(`LP d${mk.x}/USDC`, X_DECIMALS, v.pool(market)) : null;
    m = { symbol: mk.x, xMint, pMint, dMint, lpMint, mainnetMint: mk.mint, multiplier: mk.multiplier };
    dep.markets.push(m);
    save();
  }
  v = new CouponVault(dep);
  const k = v.keys(m);
  // seed price: midpoint of the 8% bid and 5% ask discounts to fair value, in USDC micro per coupon
  const fairMicro = BigInt(Math.round(mk.fair * 1e6));
  const seedMicro = BigInt(Math.round(mk.fair * 0.935 * 1e6));
  if (!(await conn.getAccountInfo(k.market))) {
    await send(`init_market ${m.symbol}`, [
      v.initMarket(admin.publicKey, m, fairMicro, BigInt(365 * 24 * 3600)),
      v.ensureAta(admin.publicKey, k.x, v.auth),
      v.ensureAta(admin.publicKey, k.d, k.pool),
      v.ensureAta(admin.publicKey, v.usdc, k.pool),
    ]);
  }
  if (k.lp) {
    const r = await v.readMarket(conn, m);
    if (r.lpSupply === 0n) {
      const seedX = toRaw(SEED_UNITS, X_DECIMALS);
      const poolD = toRaw(POOL_UNITS, X_DECIMALS);
      const usdc = (poolD * seedMicro) / 100_000_000n;
      await send(`seed mint ${m.symbol}`, [
        v.ensureAta(admin.publicKey, k.x, admin.publicKey),
        v.ensureAta(admin.publicKey, v.usdc, admin.publicKey),
        v.adminMint(admin.publicKey, k.x, v.ata(k.x, admin.publicKey), seedX),
        v.adminMint(admin.publicKey, v.usdc, v.ata(v.usdc, admin.publicKey), usdc),
      ]);
      await send(`seed split ${m.symbol}`, v.split(admin.publicKey, m, seedX));
      await send(`seed pool ${m.symbol}`, v.addLiquidity(admin.publicKey, m, poolD, usdc, 1n));
    }
  }
}
save();
console.log("deployment written to", out);
