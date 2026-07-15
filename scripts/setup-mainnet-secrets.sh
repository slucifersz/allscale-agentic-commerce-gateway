#!/usr/bin/env bash
#
# Securely collect the three HashKey mainnet private keys and store them in
# .env.local. Keys are read silently (no echo), never passed as command-line
# arguments, never printed, and written atomically with mode 600.
#
# Usage: bash scripts/setup-mainnet-secrets.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=".env.local"

EXPECTED_DEPLOYER="0xe374f6ee3380492a0a0fab06841037685bc50055"
EXPECTED_GATEWAY_SIGNER="0x56a19db692f9fb9b0ec0c1f5b4497b5ba11a9609"
EXPECTED_DEMO_AGENT="0x3e263b59c766ba7340108c6ffac42d07002fa99b"

# --- Preconditions -----------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required." >&2
  exit 1
fi

if ! git check-ignore -q "$ENV_FILE" 2>/dev/null; then
  echo "ERROR: $ENV_FILE is NOT ignored by git." >&2
  echo "Fix .gitignore so $ENV_FILE can never be committed, then rerun." >&2
  exit 1
fi
echo "Check passed: $ENV_FILE is ignored by git."

# Derives the public address from a key passed via environment (never argv).
# Prints only the address; never the key.
derive_address() {
  MAINNET_SETUP_PK="$1" node -e '
    try {
      const { ethers } = require("ethers");
      let pk = (process.env.MAINNET_SETUP_PK || "").trim();
      if (!pk.startsWith("0x")) pk = "0x" + pk;
      if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) process.exit(2);
      console.log(new ethers.Wallet(pk).address);
    } catch (_) {
      process.exit(2);
    }
  '
}

# read_key <prompt> -> sets REPLY_KEY (silent, not echoed)
read_key() {
  local prompt="$1"
  REPLY_KEY=""
  read -r -s -p "$prompt" REPLY_KEY
  echo "" >&2
}

collect_key() {
  local label="$1" expected="$2" varname="$3"
  read_key "Paste ${label} private key (input hidden): "
  local derived
  if ! derived=$(derive_address "$REPLY_KEY"); then
    echo "ERROR: ${label} input is not a valid 32-byte hex private key. Nothing was stored." >&2
    exit 1
  fi
  local derived_lc
  derived_lc=$(printf '%s' "$derived" | tr '[:upper:]' '[:lower:]')
  if [ "$derived_lc" != "$expected" ]; then
    echo "ERROR: ${label} private key does not match the expected public address." >&2
    echo "  expected: ${expected}" >&2
    echo "  derived:  ${derived}" >&2
    echo "Nothing was stored." >&2
    exit 1
  fi
  echo "${label} public address verified: ${derived}"
  printf -v "$varname" '%s' "$REPLY_KEY"
  REPLY_KEY=""
}

DEPLOYER_KEY=""
SIGNER_KEY=""
AGENT_KEY=""
collect_key "Deployer" "$EXPECTED_DEPLOYER" DEPLOYER_KEY
collect_key "Gateway Signer" "$EXPECTED_GATEWAY_SIGNER" SIGNER_KEY
collect_key "Demo Agent" "$EXPECTED_DEMO_AGENT" AGENT_KEY

# --- Atomic write into .env.local (keys passed via environment, not argv) ----
SETUP_DEPLOYER_PK="$DEPLOYER_KEY" \
SETUP_SIGNER_PK="$SIGNER_KEY" \
SETUP_AGENT_PK="$AGENT_KEY" \
node -e '
  const fs = require("fs");
  const path = require("path");
  const envFile = path.resolve(process.cwd(), ".env.local");

  const normalize = (pk) => {
    pk = (pk || "").trim();
    return pk.startsWith("0x") ? pk : "0x" + pk;
  };
  const updates = {
    HASHKEY_MAINNET_DEPLOYER_PRIVATE_KEY: normalize(process.env.SETUP_DEPLOYER_PK),
    GATEWAY_SIGNER_PRIVATE_KEY: normalize(process.env.SETUP_SIGNER_PK),
    DEMO_AGENT_PRIVATE_KEY: normalize(process.env.SETUP_AGENT_PK),
  };

  const original = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  const lines = original.length ? original.split(/\r?\n/) : [];
  const seen = new Set();
  const output = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const index = trimmed.indexOf("=");
    if (index === -1) return line;
    const key = trimmed.slice(0, index).trim();
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      seen.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });
  while (output.length && output[output.length - 1] === "") output.pop();
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) output.push(`${key}=${value}`);
  }

  const tmpFile = `${envFile}.tmp-${process.pid}`;
  fs.writeFileSync(tmpFile, output.join("\n") + "\n", { mode: 0o600 });
  fs.renameSync(tmpFile, envFile);
  fs.chmodSync(envFile, 0o600);
'

unset DEPLOYER_KEY SIGNER_KEY AGENT_KEY REPLY_KEY
chmod 600 "$ENV_FILE"

echo "Deployer private key: securely stored"
echo "Gateway Signer private key: securely stored"
echo "Demo Agent private key: securely stored"
