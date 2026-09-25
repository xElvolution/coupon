import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";
const p = ".keys/operator.json";
let kp;
if (fs.existsSync(p)) kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p))));
else { kp = Keypair.generate(); fs.writeFileSync(p, JSON.stringify([...kp.secretKey])); }
const c = new Connection("https://api.devnet.solana.com", "confirmed");
console.log("operator", kp.publicKey.toBase58(), "bal", await c.getBalance(kp.publicKey));
try { const s = await c.requestAirdrop(kp.publicKey, 1 * LAMPORTS_PER_SOL); await c.confirmTransaction(s); console.log("airdrop ok", s); } catch (e) { console.log("airdrop fail", e.message); }
console.log("bal", await c.getBalance(kp.publicKey));
