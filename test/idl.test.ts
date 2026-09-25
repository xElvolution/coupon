// Checks every SDK instruction encoding against the IDL generated from the program sources.
import { test, expect } from "bun:test";
import fs from "fs";
import { Keypair, TransactionInstruction } from "@solana/web3.js";
import { CouponVault, type Deployment } from "../src/lib/vault/sdk";

const dep: Deployment = JSON.parse(fs.readFileSync("src/lib/vault/deployment.devnet.json", "utf8"));
const v = new CouponVault(dep);
const idl = Object.fromEntries(["coupon_vault", "coupon_market", "coupon_faucet"].map((n) => [n, JSON.parse(fs.readFileSync(`idl/${n}.json`, "utf8"))]));
const SIZE: Record<string, number> = { u8: 1, u64: 8, i64: 8, f64: 8 };
const m = v.find("SPYx")!;
const k = v.keys(m);
const user = Keypair.generate().publicKey;
const last = (ixs: TransactionInstruction[] | TransactionInstruction) => (Array.isArray(ixs) ? ixs[ixs.length - 1] : ixs);

const cases: [string, string, TransactionInstruction][] = [
  ["coupon_vault", "initConfig", v.initVaultConfig(user)],
  ["coupon_vault", "initMarket", v.initMarket(user, m, 1_000_000n, 60n)],
  ["coupon_vault", "split", last(v.split(user, m, 1n))],
  ["coupon_vault", "recombine", last(v.recombine(user, m, 1n))],
  ["coupon_vault", "redeem", last(v.redeem(user, m, 1n))],
  ["coupon_vault", "claim", last(v.claim(user, m))],
  ["coupon_vault", "bump", v.bump(user, m, 1.01)],
  ["coupon_vault", "syncMetas", v.syncMetas(user, m)],
  ["coupon_market", "initConfig", v.initMarketConfig(user)],
  ["coupon_market", "initPool", last(v.initPool(user, k.d, k.lp!, k.market, 1n, 1n, m))],
  ["coupon_market", "swapSell", last(v.swapSell(user, m, 1n, 0n))],
  ["coupon_market", "swapBuy", last(v.swapBuy(user, m, 1n, 0n))],
  ["coupon_market", "addLiquidity", last(v.addLiquidity(user, m, 1n, 1n, 0n))],
  ["coupon_market", "removeLiquidity", last(v.removeLiquidity(user, m, 1n, 0n, 0n))],
  ["coupon_market", "swapSell (share pool)", last(v.swapSell(user, m, 1n, 0n, "p"))],
  ["coupon_faucet", "initConfig", v.initFaucetConfig(user)],
  ["coupon_faucet", "drip", last(v.faucet(user, k.x))],
  ["coupon_faucet", "adminMint", v.adminMint(user, k.x, user, 1n)],
];

test("every IDL instruction has an SDK encoding", () => {
  for (const [prog, spec] of Object.entries(idl)) for (const ix of spec.instructions) expect(cases.some(([p, n]) => p === prog && n.split(" ")[0] === ix.name)).toBe(true);
});

for (const [prog, name, ix] of cases) {
  test(`${prog}.${name} matches the IDL`, () => {
    const spec = idl[prog];
    const def = spec.instructions.find((i: any) => i.name === name.split(" ")[0]);
    expect(def).toBeDefined();
    expect(ix.programId.toBase58()).toBe(spec.metadata.address);
    expect(ix.data[0]).toBe(def.discriminant.value);
    expect(ix.data.length).toBe(1 + def.args.reduce((s: number, a: any) => s + SIZE[a.type], 0));
    const hasRemaining = !!def.docs?.some((d: string) => d.startsWith("remaining accounts"));
    if (hasRemaining) expect(ix.keys.length).toBeGreaterThanOrEqual(def.accounts.length);
    else expect(ix.keys.length).toBe(def.accounts.length);
    const extra = ix.keys.slice(def.accounts.length);
    def.accounts.forEach((a: any, i: number) => {
      const key = ix.keys[i];
      expect({ i, name: a.name, signer: key.isSigner }).toEqual({ i, name: a.name, signer: a.isSigner });
      if (a.isMut) expect({ i, name: a.name, w: key.isWritable }).toEqual({ i, name: a.name, w: true });
      // a read only account may only be passed writable when the same key is writable in the hook accounts
      else if (key.isWritable) expect({ i, name: a.name, dup: extra.some((e) => e.isWritable && e.pubkey.equals(key.pubkey)) }).toEqual({ i, name: a.name, dup: true });
    });
  });
}

test("hook accounts follow the ExtraAccountMetaList layout written by the vault", () => {
  const a0 = Keypair.generate().publicKey, a1 = Keypair.generate().publicKey;
  const h = v.hookAccounts(m, [a0, a1]);
  const want = [v.metas(k.d), k.market, k.x, v.pos(k.market, a0), v.pos(k.market, a1), v.rentPayer, h[6].pubkey, v.vaultId];
  expect(h.map((x) => x.pubkey.toBase58())).toEqual(want.map((x) => x.toBase58()));
  expect(h.map((x) => x.isWritable)).toEqual([false, true, false, true, true, true, false, false]);
  expect(h[6].pubkey.toBase58()).toBe("11111111111111111111111111111111");
});
