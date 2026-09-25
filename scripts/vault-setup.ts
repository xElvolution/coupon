// Deploy-time setup for the three COUPON programs (coupon_vault, coupon_market, coupon_faucet): creates the devnet test mints (Token-2022 with the
// ScaledUiAmount extension set to each xStock's real mainnet multiplier), test USDC, the
// config, one market per xStock, a seeded constant product pool per coupon (d/USDC, only for
// assets that paid a dividend in 12 months) and one per share (p/USDC, every asset).
// d mints carry the Token-2022 TransferHook extension pointing at coupon_vault.
// Usage: bun scripts/vault-setup.ts <rpc> <deployment.json> <vault id> <market id> <faucet id> [markets api]
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, type TransactionInstruction } from "@solana/web3.js";
import { ExtensionType, getMintLen, createInitializeMint2Instruction, createInitializeScaledUiAmountConfigInstruction, createInitializeTransferHookInstruction } from "@solana/spl-token";
import fs from "fs";
import { CouponVault, TOKEN_2022, X_DECIMALS, USDC_DECIMALS, type Deployment, toRaw } from "../src/lib/vault/sdk";

const [rpc, out, vaultId, marketId, faucetId, api = "http://127.0.0.1:3460/api/markets"] = process.argv.slice(2);
const conn = new Connection(rpc, "confirmed");
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(".keys/deployer.json", "utf8"))));
const SEED_UNITS = 5_000; // xStock units split by the admin to seed each pool
const POOL_UNITS = 4_000; // coupons placed in each coupon pool
const P_POOL_UNITS = 1_000; // shares placed in each share pool

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
const dep: Deployment = prev ?? { cluster: rpc.includes("devnet") ? "devnet" : "localnet", programs: { vault: vaultId, market: marketId, faucet: faucetId }, admin: admin.publicKey.toBase58(), usdcMint: "", markets: [] };
const save = () => fs.writeFileSync(out, JSON.stringify(dep, null, 2) + "\n");

const mkMint = async (label: string, decimals: number, authority: PublicKey, multiplier?: number, multiplierAuthority?: PublicKey, hook?: PublicKey) => {
  const kp = Keypair.generate();
  const ext = multiplier ? [ExtensionType.ScaledUiAmountConfig] : hook ? [ExtensionType.TransferHook] : [];
  const space = getMintLen(ext);
  const ixs: TransactionInstruction[] = [
    SystemProgram.createAccount({ fromPubkey: admin.publicKey, newAccountPubkey: kp.publicKey, space, lamports: await conn.getMinimumBalanceForRentExemption(space), programId: TOKEN_2022 }),
  ];
  if (multiplier) ixs.push(createInitializeScaledUiAmountConfigInstruction(kp.publicKey, multiplierAuthority ?? authority, multiplier, TOKEN_2022));
  // no hook authority: nobody can repoint or remove the hook later
  if (hook) ixs.push(createInitializeTransferHookInstruction(kp.publicKey, PublicKey.default, hook, TOKEN_2022));
  ixs.push(createInitializeMint2Instruction(kp.publicKey, decimals, authority, null, TOKEN_2022));
  await send(`mint ${label}`, ixs, [kp]);
  return kp.publicKey.toBase58();
};

const markets = (await (await fetch(api)).json()).markets as { x: string; mint: string; multiplier: number; fair: number; xPrice: number }[];
if (!dep.usdcMint) {
  const v0 = new CouponVault({ ...dep, usdcMint: PublicKey.default.toBase58() });
  dep.usdcMint = await mkMint("USDC (test)", USDC_DECIMALS, v0.faucetAuth);
  save();
}
let v = new CouponVault(dep);
if (!(await conn.getAccountInfo(v.config))) await send("vault init_config", [v.initVaultConfig(admin.publicKey)]);
if (!(await conn.getAccountInfo(v.marketConfig))) await send("market init_config", [v.initMarketConfig(admin.publicKey)]);
if (!(await conn.getAccountInfo(v.faucetConfig))) await send("faucet init_config", [v.initFaucetConfig(admin.publicKey)]);

// protocol rent payer for positions the transfer hook opens (a system account PDA of coupon_vault)
const PAYER_SOL = Number(process.env.PAYER_SOL ?? "0.3");
if ((await conn.getBalance(v.rentPayer)) < 0.05 * 1e9) {
  await send(`fund rent payer ${PAYER_SOL} SOL`, [SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: v.rentPayer, lamports: Math.round(PAYER_SOL * 1e9) })]);
}
// bring every existing market's hook account list to the current layout (after an upgrade)
const METAS_LEN = 8 + 4 + 4 + 6 * 35;
for (const m of dep.markets) {
  const info = await conn.getAccountInfo(v.metas(new PublicKey(m.dMint)));
  if (info && info.data.length !== METAS_LEN) await send(`sync_metas ${m.symbol}${m.testOnly ? " (short maturity)" : ""}`, [v.syncMetas(admin.publicKey, m)]);
}

for (const mk of markets) {
  let m = dep.markets.find((k) => k.symbol === mk.x);
  if (!m) {
    // test xStock: faucet mints it, the vault auth owns its multiplier (for bump replay)
    const xMint = await mkMint(`${mk.x} (test)`, X_DECIMALS, v.faucetAuth, mk.multiplier, v.auth);
    const pMint = await mkMint(`p${mk.x}`, X_DECIMALS, v.auth);
    const dMint = await mkMint(`d${mk.x}`, X_DECIMALS, v.auth, undefined, undefined, v.vaultId);
    const lpMint = mk.fair > 0 ? await mkMint(`LP d${mk.x}/USDC`, X_DECIMALS, v.pool(new PublicKey(dMint))) : null;
    const pLpMint = await mkMint(`LP p${mk.x}/USDC`, X_DECIMALS, v.pool(new PublicKey(pMint)));
    m = { symbol: mk.x, xMint, pMint, dMint, lpMint, pLpMint, mainnetMint: mk.mint, multiplier: mk.multiplier };
    dep.markets.push(m);
    save();
  }
  v = new CouponVault(dep);
  const k = v.keys(m);
  // seed price: midpoint of the 8% bid and 5% ask discounts to fair value, in USDC micro per coupon
  const fairMicro = BigInt(Math.round(mk.fair * 1e6));
  const seedMicro = BigInt(Math.round(mk.fair * 0.935 * 1e6));
  if (!(await conn.getAccountInfo(k.market))) {
    await send(`init_market ${m.symbol}`, [v.initMarket(admin.publicKey, m, fairMicro, BigInt(365 * 24 * 3600)), v.ensureAta(admin.publicKey, k.x, v.auth)]);
  }
  // share fair value per p: base units (m_base) at the xStock price, minus the coupon's fair value
  const pSeedMicro = BigInt(Math.round((mk.multiplier * mk.xPrice - mk.fair) * 1e6));
  const poolD = toRaw(POOL_UNITS, X_DECIMALS);
  const poolP = toRaw(P_POOL_UNITS, X_DECIMALS);
  const usdcD = k.lp ? (poolD * seedMicro) / 100_000_000n : 0n;
  const usdcP = (poolP * pSeedMicro) / 100_000_000n;
  const havePool = async (a: PublicKey | null) => !a || !!(await conn.getAccountInfo(a));
  const needD = k.lp && !(await havePool(k.pool));
  const needP = k.pLp && !(await havePool(k.pPool));
  if ((needD || needP) && (await v.readPosition(conn, m, admin.publicKey)).p === 0n) {
    const seedX = toRaw(SEED_UNITS, X_DECIMALS);
    await send(`seed mint ${m.symbol}`, [
      v.ensureAta(admin.publicKey, k.x, admin.publicKey),
      v.ensureAta(admin.publicKey, v.usdc, admin.publicKey),
      v.adminMint(admin.publicKey, k.x, v.ata(k.x, admin.publicKey), seedX),
      v.adminMint(admin.publicKey, v.usdc, v.ata(v.usdc, admin.publicKey), usdcD + usdcP),
    ]);
    await send(`seed split ${m.symbol}`, v.split(admin.publicKey, m, seedX));
  }
  if (needD) await send(`init_pool d${m.symbol}`, v.initPool(admin.publicKey, k.d, k.lp!, k.market, poolD, usdcD, m));
  if (needP) await send(`init_pool p${m.symbol}`, v.initPool(admin.publicKey, k.p, k.pLp!, k.market, poolP, usdcP));
}
save();
console.log("deployment written to", out);
