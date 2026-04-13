#!/usr/bin/env bash
# Run this ONCE to create Stripe products and prices for ElevatedPOS SaaS billing.
# Outputs the price IDs to patch into K8s secrets.
# Usage:
#   STRIPE_SECRET_KEY=sk_live_... bash scripts/stripe-create-prices.sh
# Make this script executable: chmod +x scripts/stripe-create-prices.sh
set -euo pipefail

: "${STRIPE_SECRET_KEY:?Set STRIPE_SECRET_KEY env var}"

echo "Creating ElevatedPOS Starter product..."
STARTER_PRODUCT=$(curl -s -X POST https://api.stripe.com/v1/products \
  -u "$STRIPE_SECRET_KEY:" \
  -d name="ElevatedPOS Starter" \
  -d description="Up to 2 devices, 1 location" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

STARTER_PRICE=$(curl -s -X POST https://api.stripe.com/v1/prices \
  -u "$STRIPE_SECRET_KEY:" \
  -d product="$STARTER_PRODUCT" \
  -d unit_amount=4900 \
  -d currency=aud \
  -d "recurring[interval]=month" \
  -d nickname="Starter Monthly" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Creating ElevatedPOS Growth product..."
GROWTH_PRODUCT=$(curl -s -X POST https://api.stripe.com/v1/products \
  -u "$STRIPE_SECRET_KEY:" \
  -d name="ElevatedPOS Growth" \
  -d description="Up to 10 devices, 3 locations" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

GROWTH_PRICE=$(curl -s -X POST https://api.stripe.com/v1/prices \
  -u "$STRIPE_SECRET_KEY:" \
  -d product="$GROWTH_PRODUCT" \
  -d unit_amount=9900 \
  -d currency=aud \
  -d "recurring[interval]=month" \
  -d nickname="Growth Monthly" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Creating ElevatedPOS Enterprise product..."
ENTERPRISE_PRODUCT=$(curl -s -X POST https://api.stripe.com/v1/products \
  -u "$STRIPE_SECRET_KEY:" \
  -d name="ElevatedPOS Enterprise" \
  -d description="Unlimited devices, unlimited locations" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

ENTERPRISE_PRICE=$(curl -s -X POST https://api.stripe.com/v1/prices \
  -u "$STRIPE_SECRET_KEY:" \
  -d product="$ENTERPRISE_PRODUCT" \
  -d unit_amount=24900 \
  -d currency=aud \
  -d "recurring[interval]=month" \
  -d nickname="Enterprise Monthly" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo ""
echo "✓ Created Stripe prices:"
echo "   STRIPE_PRICE_STARTER=$STARTER_PRICE"
echo "   STRIPE_PRICE_GROWTH=$GROWTH_PRICE"
echo "   STRIPE_PRICE_ENTERPRISE=$ENTERPRISE_PRICE"
echo ""
echo "Run the following to patch K8s:"
echo "kubectl patch secret nexus-secrets -n nexus --type=merge -p '{\"stringData\":{\"STRIPE_PRICE_STARTER\":\"$STARTER_PRICE\",\"STRIPE_PRICE_GROWTH\":\"$GROWTH_PRICE\",\"STRIPE_PRICE_ENTERPRISE\":\"$ENTERPRISE_PRICE\"}}'"
