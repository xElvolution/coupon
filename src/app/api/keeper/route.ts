import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { getSnapshot } from "@/lib/cache";
import { runKeeper, adminFromEnv } from "@/lib/vault/keeper";
import { DEPLOYMENT_ALL, RPC_URL } from "@/lib/vault/deployment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel cron calls this with `Authorization: Bearer $CRON_SECRET`. The admin key only comes from
// the server env var COUPON_ADMIN_KEY; without it the route reports what it would do.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!DEPLOYMENT_ALL) return NextResponse.json({ error: "no deployment" }, { status: 500 });
  const snap = await getSnapshot();
  const mainnet = Object.fromEntries(snap.markets.map((m) => [m.x, m.multiplier]));
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const admin = dry ? null : adminFromEnv(process.env.COUPON_ADMIN_KEY);
  const rows = await runKeeper(new Connection(process.env.KEEPER_RPC || RPC_URL, "confirmed"), DEPLOYMENT_ALL, mainnet, admin);
  return NextResponse.json({ at: new Date().toISOString(), signer: admin ? admin.publicKey.toBase58() : null, rows }, { headers: { "Cache-Control": "no-store" } });
}
