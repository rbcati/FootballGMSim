#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[netlify-parity] Node: $(node -v)"
echo "[netlify-parity] npm: $(npm -v)"

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" != "22" ]]; then
  echo "[netlify-parity] ERROR: Node 22 is required to match netlify.toml (found $(node -v))"
  exit 1
fi

if [[ ! -f "netlify.toml" ]]; then
  echo "[netlify-parity] ERROR: netlify.toml not found"
  exit 1
fi

NETLIFY_CMD="$(sed -n 's/^\s*command\s*=\s*"\(.*\)"/\1/p' netlify.toml | head -n 1)"
NETLIFY_PUBLISH="$(sed -n 's/^\s*publish\s*=\s*"\(.*\)"/\1/p' netlify.toml | head -n 1)"

if [[ -z "$NETLIFY_CMD" ]]; then
  echo "[netlify-parity] ERROR: netlify build command missing in netlify.toml"
  exit 1
fi

if [[ -z "$NETLIFY_PUBLISH" ]]; then
  echo "[netlify-parity] ERROR: netlify publish directory missing in netlify.toml"
  exit 1
fi

echo "[netlify-parity] netlify.toml build.command=$NETLIFY_CMD"
echo "[netlify-parity] netlify.toml build.publish=$NETLIFY_PUBLISH"

if [[ ! -d "node_modules" ]]; then
  echo "[netlify-parity] ERROR: node_modules is missing. Run 'npm ci' before this check."
  exit 1
fi

echo "[netlify-parity] Cleaning publish directory"
rm -rf "$NETLIFY_PUBLISH"

echo "[netlify-parity] Building production bundle with Netlify-like env"
CI=true NETLIFY=true CONTEXT=production npm run build

if [[ -f "public/sw.js" && ! -f "$NETLIFY_PUBLISH/sw.js" ]]; then
  echo "[netlify-parity] ERROR: $NETLIFY_PUBLISH/sw.js missing (public/sw.js should be copied)"
  exit 1
fi

if [[ -f "public/_headers" && ! -f "$NETLIFY_PUBLISH/_headers" ]]; then
  echo "[netlify-parity] ERROR: $NETLIFY_PUBLISH/_headers missing (public/_headers should be copied)"
  exit 1
fi

if [[ ! -f "$NETLIFY_PUBLISH/index.html" ]]; then
  echo "[netlify-parity] ERROR: $NETLIFY_PUBLISH/index.html missing after build"
  exit 1
fi

echo "[netlify-parity] OK: Netlify parity build completed and publish artifacts are present"
