import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getSnapshot();
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
