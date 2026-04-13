#!/usr/bin/env bash
# Run this once on your local machine with kubectl configured for production.
# Updates the nexus-secrets Kubernetes Secret with Stripe and billing keys.
# Usage:
#   STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... bash scripts/patch-k8s-secrets.sh
set -euo pipefail

: "${STRIPE_SECRET_KEY:?Set STRIPE_SECRET_KEY env var}"
: "${STRIPE_WEBHOOK_SECRET:?Set STRIPE_WEBHOOK_SECRET env var}"

STRIPE_WEBHOOK_SECRET_BILLING="${STRIPE_WEBHOOK_SECRET_BILLING:-$STRIPE_WEBHOOK_SECRET}"

kubectl patch secret nexus-secrets -n nexus --type='json' -p='[
  {"op":"replace","path":"/data/STRIPE_SECRET_KEY","value":"'"$(echo -n "$STRIPE_SECRET_KEY" | base64 -w0)"'"},
  {"op":"replace","path":"/data/STRIPE_WEBHOOK_SECRET","value":"'"$(echo -n "$STRIPE_WEBHOOK_SECRET" | base64 -w0)"'"},
  {"op":"add","path":"/data/STRIPE_WEBHOOK_SECRET_BILLING","value":"'"$(echo -n "$STRIPE_WEBHOOK_SECRET_BILLING" | base64 -w0)"'"}
]'

echo "✓ Stripe secrets patched in nexus-secrets"
echo ""
echo "⚠  Still needed (run scripts/stripe-create-prices.sh first to get these):"
echo "   kubectl patch secret nexus-secrets -n nexus --type=merge -p '{\"stringData\":{\"STRIPE_PRICE_STARTER\":\"price_...\",\"STRIPE_PRICE_GROWTH\":\"price_...\",\"STRIPE_PRICE_ENTERPRISE\":\"price_...\"}}'"
