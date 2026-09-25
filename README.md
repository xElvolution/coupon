# COUPON

Sell next year's dividends today.

COUPON splits an xStock (Backed's tokenized equities on Solana, e.g. SPYx) into
a share token (pSPYx) that keeps the base units and a 12 month dividend coupon
(dSPYx) that collects every Token-2022 multiplier bump. Holders sell the coupon
for cash now; buyers pick up dividend exposure below fair value.

## What is real

| Piece | Source |
|---|---|
| Multipliers | Token-2022 `scaledUiAmountConfig` read live from each xStock mint on Solana mainnet (SPYx `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W`) |
| Bump history | api.xstocks.fi public multiplier history, latest entry cross checked against the mint fields |
| xStock price | Pyth Hermes when `PYTH_API_KEY` is set (Hermes now requires a key); otherwise the live Solana market price from Jupiter |
| Pyth reference | Pyth price update accounts on Solana mainnet (push oracle `pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT`), shown with last update date |
| Wallet balances | Read only xStock balances for the connected wallet on mainnet |
| Vault | Paper ledger in the browser. With a wallet connected, each receipt is also signed onto devnet as a Memo transaction |

Coupon pricing: fair = xStock price x trailing 12 month multiplier growth;
bid = fair x 0.92, ask = fair x 0.95.

## Run

```
bun install
bun run build
bun run start --port 3460
```

Optional env: `PYTH_API_KEY`, `PYTH_HERMES_URL`, `SOLANA_RPC`.

APIs: `/api/markets`, `/api/pyth`, `/api/chain?x=SPYx`, `/api/holdings?owner=<address>`.
