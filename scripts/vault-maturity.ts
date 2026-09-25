// Short maturity test market: exercises redeem after maturity for real.
// Creates a clearly labeled SPYx test market whose maturity is minutes away (the admin picks the
// maturity at init; only the test deployment allows that, a fixed-maturity build pins 12 months),
// then the tester splits, the admin bumps once, redeem is rejected before maturity, and after
// maturity the tester makes the final coupon claim and redeems every share.
// Usage: bun scripts/vault-maturity.ts <rpc> <deployment.json> [maturity seconds, default 600]
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction, type TransactionInstruction } from "@solana/web3.js";
import { ExtensionType, getMintLen, createInitializeMint2Instruction, createInitializeScaledUiAmountConfigInstruction, createInitializeTransferHookInstruction } from "@solana/spl-token";
import fs from "fs";
import { CouponVault, TOKEN_2022, X_DECIMALS, toRaw, fromRaw, shareValue, couponClaim, explainError, type Deployment, type MarketDeployment } from "../src/lib/vault/sdk";

const [rpc, depPath, secsArg = "600"] = process.argv.slice(2);
const secs = Number(secsArg);
const conn = new Connection(rpc, "confirmed");
const load = (f: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(f, "utf8"))));
const admin = load(".keys/deployer.json");
const user = load(".keys/tester.json");
const dep: Deployment = JSON.parse(fs.readFileSync(depPath, "utf8"));
const outPath = depPath.replace(/\.json$/, ".verify-maturity.json");
const results: { action: string; sig?: string; expectError?: string; note?: string }[] = [];
let failed = 0;
const ok = (c: boolean, msg: string) => {
  console.log(c ? "  PASS" : "  FAIL", msg);
  if (!c) failed++;
};
const sendTx = async (ixs: TransactionInstruction[], signers: Keypair[]) => {
  for (let i = 0; ; i++) {
    try {
      return await sendAndConfirmTransaction(conn, new Transaction().add(...ixs), signers, { commitment: "confirmed" });
    } catch (e) {
      if (i < 5 && String((e as Error).message).includes("Blockhash not found")) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      throw e;
    }
  }
};
const send = async (action: string, ixs: TransactionInstruction[], signers: Keypair[]) => {
  const sig = await sendTx(ixs, signers);
  console.log(action.padEnd(34), sig);
  results.push({ action, sig });
  save();
  return sig;
};
const save = () => fs.writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), tester: user.publicKey.toBase58(), market: m?.xMint, maturitySecs: secs, results }, null, 2));

const LABEL = "SPYx short maturity test";
let m: MarketDeployment | undefined = dep.markets.find((k) => k.testOnly === LABEL);
let v = new CouponVault(dep);
const spy = v.find("SPYx");
const mint = async (label: string, ext: ExtensionType[], extra: (pk: PublicKey) => TransactionInstruction[], authority: PublicKey) => {
  const kp = Keypair.generate();
  const space = getMintLen(ext);
  await send(`mint ${label}`, [
    SystemProgram.createAccount({ fromPubkey: admin.publicKey, newAccountPubkey: kp.publicKey, space, lamports: await conn.getMinimumBalanceForRentExemption(space), programId: TOKEN_2022 }),
    ...extra(kp.publicKey),
    createInitializeMint2Instruction(kp.publicKey, X_DECIMALS, authority, null, TOKEN_2022),
  ], [admin, kp]);
  return kp.publicKey.toBase58();
};
if (!m) {
  const xMint = await mint(`${LABEL} x`, [ExtensionType.ScaledUiAmountConfig], (pk) => [createInitializeScaledUiAmountConfigInstruction(pk, v.auth, spy.multiplier, TOKEN_2022)], v.faucetAuth);
  const pMint = await mint(`${LABEL} p`, [], () => [], v.auth);
  const dMint = await mint(`${LABEL} d`, [ExtensionType.TransferHook], (pk) => [createInitializeTransferHookInstruction(pk, PublicKey.default, v.vaultId, TOKEN_2022)], v.auth);
  m = { symbol: "SPYx", xMint, pMint, dMint, lpMint: null, pLpMint: null, mainnetMint: spy.mainnetMint, multiplier: spy.multiplier, maturitySecs: secs, testOnly: LABEL };
  dep.markets.push(m);
  fs.writeFileSync(depPath, JSON.stringify(dep, null, 2) + "\n");
  v = new CouponVault(dep);
}
const k = v.keys(m);
if (!(await conn.getAccountInfo(k.market))) {
  await send(`init_market (maturity ${secs}s)`, [v.initMarket(admin.publicKey, m, 0n, BigInt(secs)), v.ensureAta(admin.publicKey, k.x, v.auth)], [admin]);
}
if ((await conn.getBalance(user.publicKey)) < 0.02 * LAMPORTS_PER_SOL) {
  await sendTx([SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: user.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })], [admin]);
}
const pos = () => v.readPosition(conn, m!, user.publicKey);
let mk = await v.readMarket(conn, m);
console.log(`market ${k.market.toBase58()} maturity ${new Date(mk.maturity! * 1000).toISOString()}`);
if ((await pos()).p === 0n && Date.now() / 1000 < mk.maturity!) {
  await send("admin mints 10 test x to tester", [v.ensureAta(admin.publicKey, k.x, user.publicKey), v.adminMint(admin.publicKey, k.x, v.ata(k.x, user.publicKey), toRaw(10, X_DECIMALS))], [admin]);
  await send("split 10", v.split(user.publicKey, m, toRaw(10, X_DECIMALS)), [user]);
  mk = await v.readMarket(conn, m);
  await send("admin bump before maturity", [v.bump(admin.publicKey, m, mk.multiplier! * (1.005714560286254 / 1.003909240011759))], [admin]);
  try {
    await sendTx(v.redeem(user.publicKey, m, toRaw(1, X_DECIMALS)), [user]);
    ok(false, "redeem before maturity should fail");
  } catch (e) {
    ok(explainError(e).startsWith("Not matured"), `redeem before maturity rejected: ${explainError(e)}`);
    results.push({ action: "redeem before maturity", expectError: explainError(e) });
  }
}
mk = await v.readMarket(conn, m);
const wait = mk.maturity! + 5 - Date.now() / 1000;
if (wait > 0) {
  console.log(`waiting ${Math.ceil(wait)}s for maturity`);
  await new Promise((r) => setTimeout(r, wait * 1000));
}
// the chain clock can trail wall time a little; retry until the program sees maturity
const p0 = await pos();
const expectClaim = couponClaim(p0.d, mk.mBase!, p0.snap!, mk.multiplier!);
for (let i = 0; ; i++) {
  try {
    await send("final coupon claim after maturity", v.claim(user.publicKey, m), [user]);
    break;
  } catch (e) {
    if (i > 10) throw e;
    await new Promise((r) => setTimeout(r, 5000));
  }
}
const p1 = await pos();
ok(p1.x - p0.x === expectClaim && expectClaim > 0n, `final claim paid ${fromRaw(expectClaim, 8)} raw x`);
mk = await v.readMarket(conn, m);
ok(mk.mFinal! > 0, `multiplier frozen at maturity: ${mk.mFinal}`);
for (let i = 0; ; i++) {
  try {
    await send(`redeem ${fromRaw(p1.p, 8)} p after maturity`, v.redeem(user.publicKey, m, p1.p), [user]);
    break;
  } catch (e) {
    if (i > 10 || !explainError(e).startsWith("Not matured")) throw e;
    await new Promise((r) => setTimeout(r, 5000));
  }
}
const p2 = await pos();
const out = shareValue(p1.p, mk.mBase!, mk.mFinal!);
ok(p2.p === 0n && p2.x - p1.x === out, `redeem returned ${fromRaw(out, 8)} raw x (UI ${(fromRaw(out, 8) * mk.multiplier!).toFixed(8)})`);
try {
  await sendTx(v.split(user.publicKey, m, toRaw(1, X_DECIMALS)), [user]);
  ok(false, "split after maturity should fail");
} catch (e) {
  ok(explainError(e).startsWith("Coupon matured"), `split after maturity rejected: ${explainError(e)}`);
  results.push({ action: "split after maturity", expectError: explainError(e) });
}
save();
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
