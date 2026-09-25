import { NextResponse } from "next/server";
import { MARKETS } from "@/lib/markets";
import { rpc } from "@/lib/server-data";
import { getSnapshot } from "@/lib/cache";

export const dynamic = "force-dynamic";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

// Read only: real xStock balances of a wallet on Solana mainnet.
export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get("owner") ?? "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(owner)) return NextResponse.json({ ok: false, error: "bad owner" }, { status: 400 });
  try {
    const j = await rpc("getTokenAccountsByOwner", [owner, { programId: TOKEN_2022 }, { encoding: "jsonParsed" }]);
    const snap = await getSnapshot();
    const out = MARKETS.map((m) => {
      const raw = (j.result?.value ?? [])
        .filter((a: { account: { data: { parsed: { info: { mint: string } } } } }) => a.account.data.parsed.info.mint === m.mint)
        .reduce((s: number, a: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }) => s + Number(a.account.data.parsed.info.tokenAmount.amount), 0);
      const mult = snap.markets.find((k) => k.x === m.x)?.multiplier ?? 1;
      return { x: m.x, mint: m.mint, baseUnits: raw / 1e8, uiAmount: (raw / 1e8) * mult };
    }).filter((h) => h.baseUnits > 0);
    return NextResponse.json({ ok: true, network: "solana-mainnet", owner, holdings: out }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
