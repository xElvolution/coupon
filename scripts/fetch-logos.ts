// Downloads each xStock's official logo into public/tokens/<ticker>.<ext>, so nothing hotlinks.
// Source order: the mint's Token-2022 metadata URI (json `image`), then Jupiter's token record icon.
// Usage: bun scripts/fetch-logos.ts
import fs from "fs";
import { MARKETS } from "../src/lib/markets";

const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
async function metadataUri(mint: string): Promise<string | null> {
  const r = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [mint, { encoding: "jsonParsed" }] }) })).json();
  const ext = r.result?.value?.data?.parsed?.info?.extensions ?? [];
  return ext.find((e: any) => e.extension === "tokenMetadata")?.state?.uri ?? null;
}
const out: Record<string, { file: string; source: string }> = {};
for (const m of MARKETS) {
  let img: string | null = null, source = "";
  try {
    const uri = await metadataUri(m.mint);
    if (uri) { img = (await (await fetch(uri)).json()).image ?? null; source = `token metadata ${uri}`; }
  } catch {}
  if (!img) {
    try {
      const j = await (await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${m.mint}`)).json();
      img = j?.[0]?.icon ?? null; source = "jupiter token record";
    } catch {}
  }
  if (!img) { console.log(m.x, "NOT FOUND"); continue; }
  const r = await fetch(img);
  const ct = r.headers.get("content-type") ?? "";
  const ext = ct.includes("svg") ? "svg" : ct.includes("webp") ? "webp" : ct.includes("jpeg") ? "jpg" : "png";
  const raw = `/tmp/logos/${m.x}.${ext}`;
  fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
  out[m.x] = { file: raw, source: `${source} -> ${img}` };
  console.log(m.x, ext, fs.statSync(raw).size, source, img);
}
fs.writeFileSync("/tmp/logos/sources.json", JSON.stringify(out, null, 2));
