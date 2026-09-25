import { NextResponse } from "next/server";
import { fetchScaled, fetchHistory, effectiveMultiplier } from "@/lib/server-data";
import { MARKETS, MAINNET_RPC } from "@/lib/markets";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = new URL(req.url).searchParams.get("x") ?? "SPYx";
  const m = MARKETS.find((k) => k.x.toLowerCase() === x.toLowerCase()) ?? MARKETS[0];
  try {
    const [sc, hist] = await Promise.all([fetchScaled([m.mint]), fetchHistory(m.x).catch(() => [])]);
    const c = sc[m.mint];
    if (!c) throw new Error("mint not found");
    const last = hist[hist.length - 1];
    return NextResponse.json(
      {
        ok: true,
        network: "solana-mainnet",
        rpc: MAINNET_RPC.replace(/api-key=[^&]+/, "api-key=***"),
        mint: m.mint,
        program: c.owner,
        symbol: c.symbol,
        name: c.name,
        decimals: c.decimals,
        supplyBaseUnits: c.supply,
        scaledUiAmountConfig: { authority: c.authority, multiplier: c.multiplier, newMultiplier: c.newMultiplier, newMultiplierEffectiveTimestamp: c.effective },
        effectiveMultiplier: effectiveMultiplier(c),
        lastBump: last ?? null,
        replayPer100: last ? 100 * (last.next / last.prev - 1) : null,
        history: hist,
        readAt: Date.now(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
