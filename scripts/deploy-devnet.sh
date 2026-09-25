#!/usr/bin/env bash
# Deploys the three COUPON programs to Solana devnet (each once), creates the test mints, markets
# and pools, and runs the end to end verification with a separate tester keypair.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$HOME/solana/solana-release/bin:$PATH"
RPC="${DEVNET_RPC:-https://api.devnet.solana.com}"
DEPLOYER=.keys/deployer.json
VAULT=$(solana-keygen pubkey .keys/program.json)
MARKET=$(solana-keygen pubkey .keys/market.json)
FAUCET=$(solana-keygen pubkey .keys/faucet.json)
echo "deployer $(solana-keygen pubkey $DEPLOYER) balance $(solana -u "$RPC" balance -k $DEPLOYER)"
for p in coupon_vault coupon_market coupon_faucet; do
  cargo-build-sbf --manifest-path "program/programs/$p/Cargo.toml" --sbf-out-dir program/target/deploy
done
deploy() { # skip if already deployed, so a rerun never pays twice
  if solana -u "$RPC" program show "$2" >/dev/null 2>&1; then echo "$1 already at $2"; return; fi
  solana program deploy -u "$RPC" -k "$DEPLOYER" --program-id "$3" "program/target/deploy/$1.so" --with-compute-unit-price 1000
}
deploy coupon_vault "$VAULT" .keys/program.json
deploy coupon_market "$MARKET" .keys/market.json
deploy coupon_faucet "$FAUCET" .keys/faucet.json
bun scripts/vault-setup.ts "$RPC" src/lib/vault/deployment.devnet.json "$VAULT" "$MARKET" "$FAUCET"
bun scripts/vault-verify.ts "$RPC" src/lib/vault/deployment.devnet.json SPYx
