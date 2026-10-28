import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getSnapshot();
    return NextResponse.json(
      {
        ok: data.ok,
        at: data.at,
        slot: data.slot,
        pythSource: data.pythSource,
        pythSession: data.pythSession,
        feedCount: data.markets.length * 3,
        markets: data.markets.map((m) => ({
          x: m.x,
          under: m.under,
          name: m.name,
          mint: m.mint,
          multiplier: m.multiplier,
          trailingYield: m.trailingYield,
          pythTelemetry: m.pythTelemetry,
          yieldCurve: m.yieldCurve,
          perp: m.perp,
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
