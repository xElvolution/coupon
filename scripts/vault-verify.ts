// End to end check of every instruction across coupon_vault, coupon_market and coupon_faucet, through the same SDK the app uses.
// Runs as a test (asserts balances and error codes) on localnet, and as the devnet verification.
// Usage: bun scripts/vault-verify.ts <rpc> <deployment.json> [SYMBOL]
import { Connection, Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction, type TransactionInstruction } from "@solana/web3.js";
import { ExtensionType, getMintLen, createInitializeMint2Instruction } from "@solana/spl-token";
import fs from "fs";
import { CouponVault, TOKEN_2022, X_DECIMALS, USDC_DECIMALS, swapOut, couponClaim, shareValue, toRaw, fromRaw, explainError, type Deployment } from "../src/lib/vault/sdk";

const [rpc, depPath, symbol = "SPYx"] = process.argv.slice(2);
const conn = new Connection(rpc, "confirmed");
const load = (f: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(f, "utf8"))));
const admin = load(".keys/deployer.json");
const user = load(".keys/tester.json");
const dep: Deployment = JSON.parse(fs.readFileSync(depPath, "utf8"));
const v = new CouponVault(dep);
const m = v.find(symbol);
const k = v.keys(m);
const results: { action: string; sig?: string; expectError?: string; note?: string }[] = [];
let failed = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(cond ? "  PASS" : "  FAIL", msg);
  if (!cond) failed++;
};
const send = async (action: string, ixs: TransactionInstruction[], signer = user) => {
  const sig = await sendAndConfirmTransaction(conn, new Transaction().add(...ixs), [signer], { commitment: "confirmed" });
  console.log(action.padEnd(26), sig);
  results.push({ action, sig });
  return sig;
};
const expectFail = async (action: string, ixs: TransactionInstruction[], code: number, signers: Keypair[] = [user]) => {
  try {
    await sendAndConfirmTransaction(conn, new Transaction().add(...ixs), signers, { commitment: "confirmed" });
    ok(false, `${action} should fail with code ${code}`);
  } catch (e) {
    const s = String((e as Error).message) + JSON.stringify((e as { logs?: string[] }).logs ?? "");
    const hit = s.includes(`0x${code.toString(16)}`) || s.includes(`"Custom":${code}`);
    ok(hit, `${action} rejected: ${explainError(e)}`);
    results.push({ action, expectError: explainError(e) });
  }
};
const pos = () => v.readPosition(conn, m, user.publicKey);

// fund the tester with a little SOL for fees (from the deployer, never from a faucet)
const bal = await conn.getBalance(user.publicKey);
if (bal < 0.05 * LAMPORTS_PER_SOL) {
  await sendAndConfirmTransaction(conn, new Transaction().add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: user.publicKey, lamports: 0.1 * LAMPORTS_PER_SOL })), [admin]);
}

console.log(`tester ${user.publicKey.toBase58()} on ${dep.cluster}, market ${symbol}`);
let p0 = await pos();
const lastDrip = await v.readDrip(conn, k.x, user.publicKey);
if (lastDrip === null || Date.now() / 1000 - lastDrip > 3600) {
  await send(`faucet ${symbol}`, v.faucet(user.publicKey, k.x));
  const p1 = await pos();
  ok(p1.x - p0.x === toRaw(100, X_DECIMALS), "faucet paid 100 test " + symbol);
  await send("faucet USDC", v.faucet(user.publicKey, v.usdc));
  ok((await pos()).usdc - p1.usdc === toRaw(1000, USDC_DECIMALS), "faucet paid 1,000 test USDC");
}
await expectFail("faucet again (cooldown)", v.faucet(user.publicKey, k.x), 4);

p0 = await pos();
await send(`split 50 ${symbol}`, v.split(user.publicKey, m, toRaw(50, X_DECIMALS)));
let mk = await v.readMarket(conn, m);
let p1 = await pos();
const minted = shareValue(toRaw(50, X_DECIMALS), mk.multiplier!, mk.mBase!);
ok(p1.p - p0.p === minted && p1.d - p0.d === minted, `split minted ${fromRaw(minted, 8)} p and d`);
ok(p0.x - p1.x >= toRaw(50, X_DECIMALS) - 1n, "split took 50 raw units into the vault");

// sell 20 coupons into the pool with 1% slippage tolerance
const q = swapOut(toRaw(20, X_DECIMALS), mk.reserveD, mk.reserveUsdc);
await expectFail("sell 20 with min_out 2x (slippage)", v.swapSell(user.publicKey, m, toRaw(20, X_DECIMALS), q * 2n), 11);
p0 = await pos();
await send(`sell 20 d${symbol}`, v.swapSell(user.publicKey, m, toRaw(20, X_DECIMALS), (q * 99n) / 100n));
p1 = await pos();
ok(p1.usdc - p0.usdc === q, `sell paid ${fromRaw(q, 6)} USDC (quote matched)`);
ok(p0.d - p1.d === toRaw(20, X_DECIMALS), "sell moved 20 coupons into the pool");

// admin bump mirrors the size of the last real SPYx bump (Jun 18 2026)
mk = await v.readMarket(conn, m);
const ratio = 1.005714560286254 / 1.003909240011759;
const newM = mk.multiplier! * ratio;
await send("admin bump", [v.bump(admin.publicKey, m, newM)], admin);
mk = await v.readMarket(conn, m);
ok(Math.abs(mk.multiplier! - newM) < 1e-12, `multiplier ${mk.multiplier} on chain`);

p0 = await pos();
const expectClaim = couponClaim(p0.d, mk.mBase!, p0.snap!, mk.multiplier!);
await send("claim", v.claim(user.publicKey, m));
p1 = await pos();
ok(p1.x - p0.x === expectClaim && expectClaim > 0n, `claim paid ${fromRaw(expectClaim, 8)} raw ${symbol} units (UI ${(fromRaw(expectClaim, 8) * mk.multiplier!).toFixed(8)})`);

p0 = await pos();
const rec = toRaw(10, X_DECIMALS);
await send(`recombine 10 ${symbol}`, v.recombine(user.publicKey, m, rec));
p1 = await pos();
ok(p1.x - p0.x === shareValue(rec, mk.mBase!, mk.multiplier!), `recombine returned ${fromRaw(p1.x - p0.x, 8)} raw units`);

mk = await v.readMarket(conn, m);
const qb = swapOut(toRaw(10, USDC_DECIMALS), mk.reserveUsdc, mk.reserveD);
p0 = await pos();
await send(`buy with 10 USDC`, v.swapBuy(user.publicKey, m, toRaw(10, USDC_DECIMALS), (qb * 99n) / 100n));
p1 = await pos();
ok(p1.d - p0.d === qb, `buy received ${fromRaw(qb, 8)} d${symbol}`);

mk = await v.readMarket(conn, m);
const dAdd = toRaw(5, X_DECIMALS);
const uNeed = (dAdd * mk.reserveUsdc + mk.reserveD - 1n) / mk.reserveD;
const lpExp = (dAdd * mk.lpSupply) / mk.reserveD;
await send("add liquidity 5 d", v.addLiquidity(user.publicKey, m, dAdd, (uNeed * 101n) / 100n, (lpExp * 99n) / 100n));
p1 = await pos();
ok(p1.lp === lpExp, `received ${fromRaw(lpExp, 8)} LP`);
await send("remove liquidity", v.removeLiquidity(user.publicKey, m, p1.lp, 1n, 1n));
ok((await pos()).lp === 0n, "LP burned, reserves returned");

// a fake coupon (mint not controlled by coupon_vault) must not get a pool
const fakeD = Keypair.generate(), fakeLp = Keypair.generate();
const space = getMintLen([]);
const rent = await conn.getMinimumBalanceForRentExemption(space);
await sendAndConfirmTransaction(conn, new Transaction().add(
  SystemProgram.createAccount({ fromPubkey: admin.publicKey, newAccountPubkey: fakeD.publicKey, space, lamports: rent, programId: TOKEN_2022 }),
  createInitializeMint2Instruction(fakeD.publicKey, X_DECIMALS, admin.publicKey, null, TOKEN_2022),
  SystemProgram.createAccount({ fromPubkey: admin.publicKey, newAccountPubkey: fakeLp.publicKey, space, lamports: rent, programId: TOKEN_2022 }),
  createInitializeMint2Instruction(fakeLp.publicKey, X_DECIMALS, v.pool(fakeD.publicKey), null, TOKEN_2022),
), [admin, fakeD, fakeLp]);
await expectFail("pool for a fake coupon", v.initPool(admin.publicKey, fakeD.publicKey, fakeLp.publicKey, k.market, 1n, 1n), 13, [admin]);

await expectFail("redeem before maturity", v.redeem(user.publicKey, m, toRaw(1, X_DECIMALS)), 6);

const final = await pos();
console.log("final", { x: fromRaw(final.x, 8), p: fromRaw(final.p, 8), d: fromRaw(final.d, 8), usdc: fromRaw(final.usdc, 6) });
fs.writeFileSync(depPath.replace(/\.json$/, `.verify-${symbol}.json`), JSON.stringify({ at: new Date().toISOString(), tester: user.publicKey.toBase58(), results }, null, 2));
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
