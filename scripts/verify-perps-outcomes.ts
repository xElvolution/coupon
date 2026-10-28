import fs from "fs";
import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { CouponVault, toRaw, USDC_DECIMALS, type Deployment } from "../src/lib/vault/sdk";

const rpc = process.argv[2] ?? "https://api.devnet.solana.com";
const depPath = process.argv[3] ?? "src/lib/vault/deployment.devnet.json";
const conn = new Connection(rpc, "confirmed");
const user = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(".keys/tester.json", "utf8"))));
const dep: Deployment = JSON.parse(fs.readFileSync(depPath, "utf8"));
const v = new CouponVault(dep);

async function sendWithRetry(ixs: any[]) {
  for (let i = 0; ; i++) {
    try {
      const tx = new Transaction().add(...ixs);
      return await sendAndConfirmTransaction(conn, tx, [user], { commitment: "confirmed" });
    } catch (e) {
      if (i < 5 && String((e as Error).message).includes("Blockhash not found")) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw e;
    }
  }
}

const spyx = v.find("SPYx")!;
const msftx = v.find("MSFTx")!;
const qqqx = v.find("QQQx")!;
const aaplx = v.find("AAPLx")!;
const nvdax = v.find("NVDAx")!;
const metax = v.find("METAx")!;

const orders = [
  {
    kind: "perp",
    symbol: "dSPYx-PERP",
    xSymbol: "SPYx",
    side: "LONG",
    leverage: 12,
    marginUsdc: 25,
    ixs: v.perpOrder(user.publicKey, spyx, "long", toRaw(25, USDC_DECIMALS), 12, 0n),
  },
  {
    kind: "perp",
    symbol: "dMSFTx-PERP",
    xSymbol: "MSFTx",
    side: "SHORT",
    leverage: 8,
    marginUsdc: 20,
    ixs: v.perpOrder(user.publicKey, msftx, "short", toRaw(20, USDC_DECIMALS), 8, 0n),
  },
  {
    kind: "perp",
    symbol: "dQQQx-PERP",
    xSymbol: "QQQx",
    side: "LONG",
    leverage: 10,
    marginUsdc: 20,
    ixs: v.perpOrder(user.publicKey, qqqx, "long", toRaw(20, USDC_DECIMALS), 10, 0n),
  },
  {
    kind: "perp",
    symbol: "dAAPLx-PERP",
    xSymbol: "AAPLx",
    side: "LONG",
    leverage: 12,
    marginUsdc: 18,
    ixs: v.perpOrder(user.publicKey, aaplx, "long", toRaw(18, USDC_DECIMALS), 12, 0n),
  },
  {
    kind: "outcome",
    marketId: "spyx-q4-mult",
    xSymbol: "SPYx",
    side: "YES",
    stakeUsdc: 15,
    ixs: v.outcomeOrder(user.publicKey, spyx, "spyx-q4-mult", "yes", toRaw(15, USDC_DECIMALS), 0n),
  },
  {
    kind: "outcome",
    marketId: "aapl-rr-peg",
    xSymbol: "AAPLx",
    side: "YES",
    stakeUsdc: 15,
    ixs: v.outcomeOrder(user.publicKey, aaplx, "aapl-rr-peg", "yes", toRaw(15, USDC_DECIMALS), 0n),
  },
  {
    kind: "outcome",
    marketId: "msft-div-step",
    xSymbol: "MSFTx",
    side: "YES",
    stakeUsdc: 12,
    ixs: v.outcomeOrder(user.publicKey, msftx, "msft-div-step", "yes", toRaw(12, USDC_DECIMALS), 0n),
  },
  {
    kind: "outcome",
    marketId: "nvda-basis-guard",
    xSymbol: "NVDAx",
    side: "YES",
    stakeUsdc: 12,
    ixs: v.outcomeOrder(user.publicKey, nvdax, "nvda-basis-guard", "yes", toRaw(12, USDC_DECIMALS), 0n),
  },
  {
    kind: "outcome",
    marketId: "qqq-12m-mult",
    xSymbol: "QQQx",
    side: "NO",
    stakeUsdc: 10,
    ixs: v.outcomeOrder(user.publicKey, qqqx, "qqq-12m-mult", "no", toRaw(10, USDC_DECIMALS), 0n),
  },
  {
    kind: "outcome",
    marketId: "meta-yield-curve",
    xSymbol: "METAx",
    side: "YES",
    stakeUsdc: 10,
    ixs: v.outcomeOrder(user.publicKey, metax, "meta-yield-curve", "yes", toRaw(10, USDC_DECIMALS), 0n),
  },
];

const results: any[] = [];
for (const o of orders) {
  const sig = await sendWithRetry(o.ixs);
  console.log(o.kind.padEnd(10), (o.symbol ?? o.marketId).padEnd(18), o.side.padEnd(6), sig);
  results.push({
    kind: o.kind,
    id: o.symbol ?? o.marketId,
    xSymbol: o.xSymbol,
    side: o.side,
    leverage: o.leverage ?? null,
    usdcAmount: o.marginUsdc ?? o.stakeUsdc,
    sig,
    at: new Date().toISOString(),
  });
}

const outPath = "src/lib/vault/deployment.devnet.verify-perps-outcomes.json";
fs.writeFileSync(outPath, JSON.stringify({ cluster: dep.cluster, tester: user.publicKey.toBase58(), results }, null, 2) + "\n");
console.log("Saved", outPath);
