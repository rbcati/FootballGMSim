#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[netlify-parity] Node: $(node -v)"
echo "[netlify-parity] npm: $(npm -v)"

echo "[netlify-parity] Cleaning install artifacts"
rm -rf node_modules dist

echo "[netlify-parity] Installing dependencies from package-lock.json"
npm ci

echo "[netlify-parity] Building production bundle"
npm run build

if [[ ! -f "dist/index.html" ]]; then
  echo "[netlify-parity] ERROR: dist/index.html missing after build"
  exit 1
fi

echo "[netlify-parity] OK: dist/index.html present"
