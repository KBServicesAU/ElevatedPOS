# ElevatedPOS Production Deployment Guide

## Prerequisites
- AWS account with appropriate IAM permissions
- Domain name registered (any registrar)
- Expo account + EAS CLI configured
- Apple Developer account (for iOS IPA distribution)
- `kubectl`, `terraform`, `aws-cli`, `pnpm`, `eas-cli` installed locally

---

## 1. Initial AWS Setup

```bash
# Configure AWS CLI
aws configure
# Region: ap-southeast-2
# Output format: json

# Initialise Terraform
cd infrastructure/terraform
terraform init

# Copy and fill in your variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — set domain_name, db_password, etc.

# Plan and apply
terraform plan -out=tfplan
terraform apply tfplan
```

After apply, Terraform outputs your **nameservers**. Point your domain registrar to these nameservers. DNS propagation takes 5-48 hours.

---

## 2. Configure GitHub Secrets

Go to Settings → Secrets → Actions and add:

| Secret | Value |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | From IAM user |
| `AWS_SECRET_ACCESS_KEY` | From IAM user |
| `AWS_ACCOUNT_ID` | Your 12-digit AWS account ID |
| `DB_PASSWORD` | Same as terraform.tfvars db_password |
| `JWT_SECRET` | 256-bit random string |
| `INTERNAL_SECRET` | 256-bit random string |
| `STRIPE_SECRET_KEY` | From Stripe dashboard |
| `STRIPE_PUBLISHABLE_KEY` | From Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | From Stripe webhook settings |
| `NEXTAUTH_SECRET` | 256-bit random string |
| `EXPO_TOKEN` | From expo.dev → Access Tokens |
| `EAS_PROJECT_ID` | From eas.json after `eas init` |
| `EXPO_PUBLIC_API_URL` | `https://api.your-domain.com` |

Generate random secrets:
```bash
openssl rand -base64 32
```

---

## 3. First Deployment

```bash
# Build and push all Docker images, run migrations, deploy to EKS
git tag v1.0.0
git push origin v1.0.0
```

This triggers the CI/CD pipeline which:
1. Runs all tests
2. Builds Docker images for all 15 services
3. Pushes to ECR
4. Runs database migrations
5. Deploys to EKS

---

## 4. Build Mobile APKs

After the server is deployed and `EXPO_PUBLIC_API_URL` is set:

```bash
cd apps/mobile

# Build all three role-locked APKs (triggered automatically on version tag)
# Or manually:
eas build --profile production-pos   --platform android --non-interactive
eas build --profile production-kds   --platform android --non-interactive
eas build --profile production-kiosk --platform android --non-interactive

# For iPad (iOS):
eas build --profile production-pos   --platform ios --non-interactive
eas build --profile production-kds   --platform ios --non-interactive
eas build --profile production-kiosk --platform ios --non-interactive
```

Downloads appear in the Expo dashboard at expo.dev.

---

## 5. Distributing APKs to Customers

### Android APK (direct install)
1. Download the `.apk` from expo.dev after build completes
2. Send directly to customer or host on your download server
3. Customer enables "Install from unknown sources" in Android settings
4. Installs like any app

### iOS IPA (iPad)
With enterprise/adhoc provisioning:
1. Download the `.ipa` from expo.dev
2. Distribute via Apple Configurator 2 (USB) or MDM (Mobile Device Management)
3. For ad-hoc: device UDID must be registered in your Apple Developer account first

### Which APK goes to which customer?
| Product tier | Android | iOS |
|---|---|---|
| Base (POS) | `elevatedpos-pos.apk` | `elevatedpos-pos.ipa` |
| + KDS addon | `elevatedpos-kds.apk` | `elevatedpos-kds.ipa` |
| + Kiosk addon | `elevatedpos-kiosk.apk` | `elevatedpos-kiosk.ipa` |

---

## 6. Onboarding a New Customer

1. Create their organisation in the back-office (or via `POST /api/v1/auth/register`)
2. Set their plan in the database (`professional` for KDS/Kiosk access)
3. Send them their back-office URL: `https://app.your-domain.com`
4. They generate pairing codes from **Devices → Generate Code**
5. They enter the code on each device
6. Devices are online within 30 seconds

---

## 7. Monitoring

- **Logs**: `kubectl logs -n elevatedpos -l app=<service> --follow`
- **Metrics**: CloudWatch Container Insights (enabled by EKS add-on)
- **Health checks**: All services expose `GET /health` → `{ status: 'ok' }`
- **Alerts**: Configure CloudWatch alarms for CPU, memory, error rates

---

## 8. SSL Certificate Renewal

ACM certificates auto-renew. No action required as long as the DNS validation records remain in Route53 (Terraform manages these — do not delete them).

---

## 9. Transactional Email (Resend + DKIM/SPF/DMARC)

Order confirmations, receipts, pickup-ready notifications, password-reset links and invoice emails all go through [Resend](https://resend.com). Before a fresh environment can actually deliver email you need to complete **four** setup steps in order.

### Step 1 — Verify the sending domain in Resend

1. Sign in to Resend → **Domains → Add Domain**.
2. Enter the sending subdomain: `email.<your-domain>` (production: `email.elevatedpos.com.au`). Sending from the bare domain is possible but reserving it for transactional mail keeps the rest of your DNS clean.
3. Resend shows:
   - **1× SPF TXT** record on `email.<your-domain>`
   - **3× DKIM CNAME** records on `<selector>._domainkey.email.<your-domain>` — each has its own selector name + target like `<hash>.dkim.amazonses.com`
   - **1× DMARC TXT** on `_dmarc.email.<your-domain>` (optional — we publish a policy from terraform)
4. Copy each DKIM record's **selector name** and **CNAME target**. You'll feed these into the terraform variables in step 3.

### Step 2 — Populate the secret

`RESEND_API_KEY` lives in `infrastructure/k8s/secrets.yaml` (the real file, NOT `secrets.yaml.template`):

```yaml
RESEND_API_KEY: "re_XXXXXXXXXXXXXXXXXXXX"
```

Apply: `kubectl apply -f infrastructure/k8s/secrets.yaml`. The `notifications` and `integrations` deployments pick this up via `envFrom: secretRef`.

### Step 3 — Fill in DKIM selectors in terraform

`infrastructure/terraform/dns.tf` carries variables for the three Resend-issued DKIM selectors + their CNAME targets. They default to empty — the `local.email_dns_enabled` flag skips creating the records until all six variables are non-empty, so `terraform apply` on a fresh clone won't try to make broken DNS.

Create a `terraform.tfvars` (or per-env `prod.tfvars`, gitignored):

```hcl
resend_dkim_selector_1 = "resend1"                     # example — use the real selector name
resend_dkim_cname_1    = "abc123.dkim.amazonses.com"   # example — use the real CNAME target
resend_dkim_selector_2 = "resend2"
resend_dkim_cname_2    = "def456.dkim.amazonses.com"
resend_dkim_selector_3 = "resend3"
resend_dkim_cname_3    = "ghi789.dkim.amazonses.com"
```

Then `terraform apply` from `infrastructure/terraform/`. The TF will create:

- `email.<domain>`                             — SPF TXT (`v=spf1 include:amazonses.com ~all`)
- `<selector1>._domainkey.email.<domain>`      — DKIM CNAME
- `<selector2>._domainkey.email.<domain>`      — DKIM CNAME
- `<selector3>._domainkey.email.<domain>`      — DKIM CNAME
- `_dmarc.email.<domain>`                      — DMARC TXT (starts at `p=none`; bump to `p=quarantine` after 2 weeks)
- `email.<domain>`                             — MX → `feedback-smtp.ap-southeast-2.amazonses.com` (quiet drop of replies)

### Step 4 — Verify in Resend + observe

1. Back in Resend → **Domains → <your subdomain>** click **Verify**. All four records (SPF + 3× DKIM) should flip to green within a few minutes. DMARC is a separate signal and isn't required for verification but helps deliverability.
2. Send a test: from the notifications service pod, `curl -X POST http://notifications:4009/api/v1/notifications/email -H 'Authorization: Bearer <dev-jwt>' -d '{"to":"you@example.com","subject":"test","template":"custom","data":{"body":"<p>hi</p>"},"orgId":"<your org>"}'`.
3. Check Resend dashboard → **Emails** tab. Status should be `delivered`.
4. If it's `bounced` or `complained`, the DNS records likely haven't propagated. Wait 10 minutes and retry.

### What the symptoms look like when DKIM/SPF is missing

- Resend accepts the send but Gmail/Outlook quietly drop it into spam
- Some inboxes may return a `550 Message rejected due to unauthenticated sender` bounce that surfaces in Resend's **Bounces** tab
- `services/notifications/notification_logs` will record `status='sent'` because the Resend API returned 202 — the delivery failure happens downstream
- v2.7.41+ email helper now retries transient `rate_limit` / `internal_server_error` errors 3× with exponential backoff, but it can't fix authentication failures — those need the DNS above.

### Quick sanity check from any workstation

```bash
dig TXT email.elevatedpos.com.au +short
# expect: "v=spf1 include:amazonses.com ~all"

dig TXT _dmarc.email.elevatedpos.com.au +short
# expect: "v=DMARC1; p=none; rua=mailto:dmarc@elevatedpos.com.au; ..."

dig CNAME resend1._domainkey.email.elevatedpos.com.au +short
# expect: some-hash.dkim.amazonses.com.   (trailing dot expected)
```
