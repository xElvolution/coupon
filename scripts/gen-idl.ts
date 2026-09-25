// Generates Shank style IDL files (idl/*.json) from the instruction doc comments in each program's
// lib.rs. Each instruction is documented as `/// <tag> <name>(<args>): [<accounts>]` with `s` (signer)
// and `w` (writable) flags. test/idl.test.ts checks the SDK encodings against these files.
// Usage: bun scripts/gen-idl.ts
import fs from "fs";
import { ERRORS } from "../src/lib/vault/sdk";

const dep = JSON.parse(fs.readFileSync("src/lib/vault/deployment.devnet.json", "utf8"));
const common = fs.readFileSync("program/crates/common/src/lib.rs", "utf8");
const errNames = [...common.matchAll(/^\s+([A-Z]\w+) = (\d+),/gm)].map((m) => ({ code: Number(m[2]), name: m[1] }));
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const argType = (name: string, explicit?: string) => explicit ?? (name === "maturity_secs" ? "i64" : "u64");

function parse(src: string) {
  const blocks: string[] = [];
  let cur: string[] = [];
  for (const line of src.split("\n")) {
    const m = line.match(/^\/\/\/ ?(.*)$/);
    if (m) cur.push(m[1].trim());
    else if (cur.length) (blocks.push(cur.join(" ")), (cur = []));
  }
  const out: any[] = [];
  for (const b of blocks) {
    const open = b.indexOf("[");
    if (open < 0) continue;
    const head = b.slice(0, open);
    const heads = [...head.matchAll(/(?:^|[\s,])(\d+) ([a-z_]+)(?:\(([^)]*)\))?/g)];
    if (!heads.length) continue;
    const list = b.slice(open + 1, b.indexOf("]", open));
    const accounts: any[] = [];
    let remaining: string | undefined;
    for (const raw of list.split(",").map((t) => t.trim())) {
      if (/^\d+\.\./.test(raw)) {
        remaining = raw.replace(/^\d+\.\.\s*/, "");
        continue;
      }
      const words = raw.replace(/^\d+\s+/, "").replace(/\([^)]*\)/g, "").split(/\s+/).filter(Boolean);
      const flags = new Set(words.filter((w) => w === "s" || w === "w"));
      accounts.push({ name: camel(words.filter((w) => w !== "s" && w !== "w").join("_")), isMut: flags.has("w"), isSigner: flags.has("s") });
    }
    for (const h of heads) {
      const args = (h[3] ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((a) => {
        const [n, t] = a.split(/\s+/);
        return { name: camel(n), type: argType(n, t) };
      });
      out.push({ name: camel(h[2]), accounts, args, discriminant: { type: "u8", value: Number(h[1]) }, ...(remaining ? { docs: [`remaining accounts: ${remaining}`] } : {}) });
    }
  }
  return out.sort((a, b) => a.discriminant.value - b.discriminant.value);
}

fs.mkdirSync("idl", { recursive: true });
for (const [key, name] of [["vault", "coupon_vault"], ["market", "coupon_market"], ["faucet", "coupon_faucet"]]) {
  const instructions = parse(fs.readFileSync(`program/programs/${name}/src/lib.rs`, "utf8"));
  const idl = {
    version: "0.1.0",
    name,
    instructions,
    errors: errNames.map((e) => ({ ...e, msg: ERRORS[e.code] ?? e.name })),
    metadata: { origin: "shank", address: dep.programs[key], encoding: "u8 tag, then little endian args; no Anchor discriminators" },
  };
  fs.writeFileSync(`idl/${name}.json`, JSON.stringify(idl, null, 2) + "\n");
  console.log(`idl/${name}.json`, instructions.map((i) => `${i.discriminant.value}:${i.name}(${i.accounts.length})`).join(" "));
}
