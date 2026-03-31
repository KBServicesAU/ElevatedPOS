# ElevatedPOS Plan Tiers

## Starter (Free / Base)
- POS terminals (unlimited)
- Back-office dashboard
- Basic reporting
- 1 location

## Professional ($X/month)
- Everything in Starter
- KDS displays (Kitchen Display System addon)
- Kiosk ordering terminals
- Multi-location (up to 5)
- Advanced reporting
- Loyalty programs

## Enterprise (Custom pricing)
- Everything in Professional
- Unlimited locations
- White-label branding
- Franchise management
- Priority support
- Custom integrations
- SLA guarantee

---
## Plan Enforcement
Plans are stored in `organisations.plan` ('starter' | 'professional' | 'enterprise') and `organisations.planStatus` ('active' | 'suspended' | 'cancelled').

Device pairing is gated by plan:
- POS: available on all plans
- KDS: Professional+ only
- Kiosk: Professional+ only

Plan upgrades are processed via Stripe subscriptions (see services/payments).
