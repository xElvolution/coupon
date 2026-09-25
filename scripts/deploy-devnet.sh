#!/usr/bin/env bash
# Deploys coupon_vault to Solana devnet, creates the test mints, markets and pools, and runs the
# end to end verification with a separate tester keypair. Needs about 1.5 SOL on the deployer.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$HOME/solana/solana-release/bin:$PATH"
RPC="${DEVNET_RPC:-https://api.devnet.solana.com}"
PROGRAM_KP=.keys/program.json
DEPLOYER=.keys/deployer.json
PID=$(solana-keygen pubkey "$PROGRAM_KP")
echo "deployer $(solana-keygen pubkey $DEPLOYER) balance $(solana -u "$RPC" balance -k $DEPLOYER)"
(cd program && cargo-build-sbf)
solana program deploy -u "$RPC" -k "$DEPLOYER" --program-id "$PROGRAM_KP" program/target/deploy/coupon_vault.so
bun scripts/vault-setup.ts "$RPC" src/lib/vault/deployment.devnet.json "$PID"
bun scripts/vault-verify.ts "$RPC" src/lib/vault/deployment.devnet.json SPYx
