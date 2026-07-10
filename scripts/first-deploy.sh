#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Verify build"
pnpm build

echo "==> Push david-dev (force-with-lease: remote only has README initial commit)"
git push -u origin david-dev --force-with-lease

echo "==> Update main for production"
git push origin david-dev:main --force-with-lease

echo "==> Done. If Vercel is linked to StellarSociety/SS_OPS_HUB main, production deploy starts automatically."
echo "    Production URL: https://ss-ops-hub.vercel.app"
