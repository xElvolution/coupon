import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/cache";
import { pythAccount } from "@/lib/server-data";
import { MARKETS } from "@/lib/markets";

export const dynamic = "force-dynamic";

export async function GET() {
  const d = await getSnapshot();
  return NextResponse.json(
    {
      source: d.pythSource,
      detail: d.sources.pyth,
      at: d.at,
      prices: d.markets.map((m) => {
        const def = MARKETS.find((k) => k.x === m.x)!;
        return {
          symbol: m.under, equity: m.equity, equityPublish: m.equityPublish, equityFeedId: def.equityFeed, equityAccount: pythAccount(def.equityFeed),
          xStock: m.x, xPrice: m.xPrice, xPublish: m.xPublish, xFeedId: def.xFeed, xAccount: pythAccount(def.xFeed),
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
