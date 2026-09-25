import { PublicKey, Connection } from "@solana/web3.js";
const prog = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");
const ids = { SPY:"19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5", SPYx:"2817b78438c769357182c04346fddaad1178c82f4048828fe0997c3c64624e14", AAPL:"49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688", AAPLx:"978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675", SOL:"ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d" };
const c = new Connection(process.env.RPC || "https://solana-rpc.publicnode.com");
for (const [k,id] of Object.entries(ids)) {
  const shard = Buffer.alloc(2); shard.writeUInt16LE(0);
  const [pda] = PublicKey.findProgramAddressSync([shard, Buffer.from(id,"hex")], prog);
  const a = await c.getAccountInfo(pda);
  console.log(k, pda.toBase58(), a ? a.data.length : null);
  if (a) {
    const d = a.data; // PriceUpdateV2: 8 disc + 32 write_authority + verification_level(1 or 2) + feed msg
    let o = 8+32; const vl = d[o]; o += vl===0 ? 2 : 1;
    const feed = d.subarray(o, o+32).toString("hex"); o+=32;
    const price = d.readBigInt64LE(o); o+=8; const conf = d.readBigUInt64LE(o); o+=8; const expo = d.readInt32LE(o); o+=4; const pt = d.readBigInt64LE(o);
    console.log("  feed", feed===id, "price", Number(price)*10**expo, "publish", new Date(Number(pt)*1000).toISOString());
  }
}
