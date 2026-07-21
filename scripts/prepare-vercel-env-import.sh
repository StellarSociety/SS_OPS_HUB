#!/usr/bin/env bash
# Build a one-time .env file for Vercel Dashboard → Import (Production + Preview).
# Does not print secret values. Output is gitignored.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/.env.local"
OUT="$ROOT/.env.vercel.import"
PROD_URL="${NEXT_PUBLIC_APP_URL_PROD:-https://ssopshub.vercel.app}"

REQUIRED=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  DATABASE_URL
  RESEND_API_KEY
  RESEND_FROM_EMAIL
  NEXT_PUBLIC_APP_URL
  AI_GATEWAY_API_KEY
)

if [[ ! -f "$SRC" ]]; then
  echo "Missing $SRC — copy from .env.example and fill in values first."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$SRC"
set +a

missing=()
for key in "${REQUIRED[@]}"; do
  val="${!key-}"
  if [[ -z "${val// /}" ]]; then
    missing+=("$key")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "These required variables are empty in .env.local:"
  printf '  - %s\n' "${missing[@]}"
  exit 1
fi

# Optional but recommended for cron + monitoring
OPTIONAL=(CRON_SECRET SENTRY_DSN VERCEL_PROJECT_ID)

{
  for key in "${REQUIRED[@]}"; do
    if [[ "$key" == "NEXT_PUBLIC_APP_URL" ]]; then
      printf '%s=%s\n' "$key" "$PROD_URL"
    else
      printf '%s=%s\n' "$key" "${!key}"
    fi
  done
  for key in "${OPTIONAL[@]}"; do
    val="${!key-}"
    if [[ -n "${val// /}" ]]; then
      printf '%s=%s\n' "$key" "$val"
    fi
  done
} > "$OUT"

chmod 600 "$OUT"

echo "Wrote $OUT (mode 600, gitignored)."
echo ""
echo "Next — in the browser (StellarSociety / ss-ops-hub Vercel team):"
echo "  1. Open https://vercel.com/ss-ops-hub/ss-ops-hub/settings/environment-variables"
echo "  2. Click \"Import .env\" (or Add → Bulk import)"
echo "  3. Upload or paste: $OUT"
echo "  4. Select environments: Production and Preview"
echo "  5. Save, then Deployments → latest Production → Redeploy"
echo ""
echo "NEXT_PUBLIC_APP_URL in the import file is set to: $PROD_URL"
echo "After deploy, test staff save on production and refresh — changes should stick."
