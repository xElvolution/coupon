// Multiplier keeper, command line: bump each devnet test mint to its mainnet multiplier when mainnet is higher.
// Usage: bun scripts/keeper.ts <devnet rpc> <deployment.json> [markets api] [--dry]
// Admin key: COUPON_ADMIN_KEY env (JSON byte array), else .keys/deployer.json.
import { Connection } from "@solana/web3.js";
import fs from "fs";
import { runKeeper, adminFromEnv } from "../src/lib/vault/keeper";
import type { Deployment } from "../src/lib/vault/sdk";

const args = process.argv.slice(2).filter((a) => a !== "--dry");
const dry = process.argv.includes("--dry");
const [rpc, depPath, api = "http://127.0.0.1:3460/api/markets"] = args;
const dep: Deployment = JSON.parse(fs.readFileSync(depPath, "utf8"));
const markets = (await (await fetch(api)).json()).markets as { x: string; multiplier: number | null }[];
const admin = dry ? null : adminFromEnv(process.env.COUPON_ADMIN_KEY ?? (fs.existsSync(".keys/deployer.json") ? fs.readFileSync(".keys/deployer.json", "utf8") : undefined));
const rows = await runKeeper(new Connection(rpc, "confirmed"), dep, Object.fromEntries(markets.map((m) => [m.x, m.multiplier])), admin);
for (const r of rows) console.log(r.symbol.padEnd(7), String(r.mainnet).padEnd(20), String(r.devnet).padEnd(20), r.action, r.sig ?? "");
const bumped = rows.filter((r) => r.action === "bumped").length;
console.log(bumped ? `${bumped} bump(s) sent` : "no bumps needed: devnet is in sync or ahead of mainnet");
fs.writeFileSync(depPath.replace(/\.json$/, ".keeper.json"), JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
